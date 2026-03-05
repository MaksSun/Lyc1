"""
Скрипт миграции базы данных.
Добавляет новые колонки в существующие таблицы без потери данных.
Вызывается автоматически при старте приложения.
"""
import sqlite3
import logging

logger = logging.getLogger(__name__)


def run_migrations(db_path: str) -> None:
    """
    Выполняет все необходимые миграции БД.
    Безопасно: если колонка уже существует, пропускает её.
    """
    if not db_path:
        logger.debug("Миграция пропущена: не SQLite база данных")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Список всех миграций: (таблица, колонка, определение)
    migrations = [
        # ── Таблица attempts ──────────────────────────────────────────────────
        # participant_id — для публичных тестов (без привязки к классу)
        ("attempts", "participant_id",      "INTEGER DEFAULT NULL"),
        # class_name — название класса (денормализованное для быстрого отображения)
        ("attempts", "class_name",          "TEXT NOT NULL DEFAULT ''"),
        # started_at — время начала попытки
        ("attempts", "started_at",          "DATETIME DEFAULT NULL"),
        # time_spent_seconds — сколько секунд потрачено
        ("attempts", "time_spent_seconds",  "INTEGER DEFAULT NULL"),

        # ── Таблица answers ────────────────────────────────────────────────────
        # score — баллы за ответ (добавлено в v4)
        ("answers", "score",     "INTEGER NOT NULL DEFAULT 0"),
        # max_score — максимум баллов за этот вопрос (добавлено в v4)
        ("answers", "max_score", "INTEGER NOT NULL DEFAULT 1"),

        # ── Таблица daily_assignments ──────────────────────────────────────────
        ("daily_assignments", "time_limit_minutes",    "INTEGER NOT NULL DEFAULT 0"),
        ("daily_assignments", "questions_limit",       "INTEGER NOT NULL DEFAULT 0"),
        ("daily_assignments", "questions_random",      "BOOLEAN NOT NULL DEFAULT 0"),
        ("daily_assignments", "student_assign_limit",  "INTEGER DEFAULT NULL"),
        ("daily_assignments", "student_assign_random", "BOOLEAN NOT NULL DEFAULT 0"),

        # ── Таблица classrooms ────────────────────────────────────────────────
        ("classrooms", "student_assign_limit",  "INTEGER NOT NULL DEFAULT 0"),
        ("classrooms", "student_assign_random", "BOOLEAN NOT NULL DEFAULT 0"),

        # ── Таблица students ──────────────────────────────────────────────────
        ("students", "extra_data", "TEXT DEFAULT NULL"),

        # ── Таблица materials ─────────────────────────────────────────────────
        # Если таблица уже существует без новых колонок — добавляем их
        ("materials", "updated_at",    "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("materials", "class_id",      "INTEGER DEFAULT NULL"),
        ("materials", "assignment_id", "TEXT DEFAULT NULL"),
        ("materials", "sort_order",    "INTEGER NOT NULL DEFAULT 0"),
        ("materials", "description",   "TEXT NOT NULL DEFAULT ''"),
        ("materials", "material_type", "TEXT NOT NULL DEFAULT 'text'"),
        ("materials", "content",       "TEXT DEFAULT NULL"),
        ("materials", "created_at",    "DATETIME DEFAULT CURRENT_TIMESTAMP"),

        # ── Таблица surveys ───────────────────────────────────────────────────
        # Если таблица уже существует без новых колонок — добавляем их
        ("surveys", "assignment_path",    "TEXT NOT NULL DEFAULT ''"),
        ("surveys", "time_limit_minutes", "INTEGER NOT NULL DEFAULT 0"),
        ("surveys", "show_results",       "BOOLEAN NOT NULL DEFAULT 1"),
        ("surveys", "is_active",          "BOOLEAN NOT NULL DEFAULT 1"),
        ("surveys", "description",        "TEXT NOT NULL DEFAULT ''"),
        ("surveys", "survey_type",        "TEXT NOT NULL DEFAULT 'test'"),
        ("surveys", "access_code",        "TEXT NOT NULL DEFAULT ''"),
        ("surveys", "created_at",         "DATETIME DEFAULT CURRENT_TIMESTAMP"),

        # ── Таблица survey_participants ───────────────────────────────────────
        ("survey_participants", "email",      "TEXT NOT NULL DEFAULT ''"),
        ("survey_participants", "extra_data", "TEXT DEFAULT NULL"),
        ("survey_participants", "survey_id",  "INTEGER NOT NULL DEFAULT 0"),
        ("survey_participants", "name",       "TEXT NOT NULL DEFAULT ''"),
        ("survey_participants", "created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),

        # ── Новые колонки daily_assignments ──────────────────────────────────
        ("daily_assignments", "max_attempts",         "INTEGER NOT NULL DEFAULT 0"),
        ("daily_assignments", "show_correct_answers", "BOOLEAN NOT NULL DEFAULT 1"),

        # ── Таблица login_logs ────────────────────────────────────────────────
        ("login_logs", "student_id",   "INTEGER NOT NULL DEFAULT 0"),
        ("login_logs", "student_name", "TEXT NOT NULL DEFAULT ''"),
        ("login_logs", "class_name",   "TEXT NOT NULL DEFAULT ''"),
        ("login_logs", "logged_in_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("login_logs", "ip_address",   "TEXT DEFAULT NULL"),
        ("login_logs", "user_agent",   "TEXT DEFAULT NULL"),
        ("login_logs", "device_type",  "TEXT DEFAULT NULL"),
        ("login_logs", "browser",      "TEXT DEFAULT NULL"),
        ("login_logs", "os",           "TEXT DEFAULT NULL"),
    ]

    # Получаем список всех существующих таблиц
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {row[0] for row in cursor.fetchall()}

    applied = 0
    skipped = 0

    for table, column, col_def in migrations:
        if table not in existing_tables:
            logger.debug(f"Таблица {table} не существует, пропускаем")
            skipped += 1
            continue

        # Проверяем, есть ли уже такая колонка
        cursor.execute(f"PRAGMA table_info({table})")
        existing_columns = {row[1] for row in cursor.fetchall()}

        if column in existing_columns:
            skipped += 1
            continue

        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
            logger.info(f"Миграция: добавлена колонка {table}.{column}")
            applied += 1
        except sqlite3.OperationalError as e:
            logger.warning(f"Не удалось добавить {table}.{column}: {e}")

    # Создаём новые таблицы, если их нет
    new_tables_sql = [
        # Таблица участников публичных тестов
        """
        CREATE TABLE IF NOT EXISTS survey_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '',
            extra_data TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,
        # Таблица публичных тестов/анкет
        """
        CREATE TABLE IF NOT EXISTS surveys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            access_code TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            survey_type TEXT NOT NULL DEFAULT 'test',
            assignment_path TEXT NOT NULL DEFAULT '',
            time_limit_minutes INTEGER NOT NULL DEFAULT 0,
            show_results BOOLEAN NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,
        # Таблица журнала входов
        """
        CREATE TABLE IF NOT EXISTS login_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            student_name TEXT NOT NULL DEFAULT '',
            class_name TEXT NOT NULL DEFAULT '',
            logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT DEFAULT NULL,
            user_agent TEXT DEFAULT NULL,
            device_type TEXT DEFAULT NULL,
            browser TEXT DEFAULT NULL,
            os TEXT DEFAULT NULL
        )
        """,
        # Таблица обучающих материалов
        """
        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            material_type TEXT NOT NULL DEFAULT 'text',
            content TEXT DEFAULT NULL,
            class_id INTEGER DEFAULT NULL REFERENCES classrooms(id) ON DELETE SET NULL,
            assignment_id TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ]

    # Таблица попыток игры «Робот-Исполнитель»
    new_tables_sql.append("""
        CREATE TABLE IF NOT EXISTS robot_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            student_name TEXT NOT NULL DEFAULT '',
            class_name TEXT NOT NULL DEFAULT '',
            level_id TEXT NOT NULL DEFAULT '',
            level_name TEXT NOT NULL DEFAULT '',
            success BOOLEAN NOT NULL DEFAULT 0,
            steps INTEGER NOT NULL DEFAULT 0,
            code TEXT NOT NULL DEFAULT '',
            time_seconds INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Таблица heartbeat для отслеживания онлайн-присутствия
    new_tables_sql.append("""
        CREATE TABLE IF NOT EXISTS student_heartbeats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            assignment_id TEXT DEFAULT NULL,
            class_id INTEGER DEFAULT NULL REFERENCES classrooms(id) ON DELETE SET NULL
        )
    """)

    for sql in new_tables_sql:
        try:
            cursor.execute(sql)
        except sqlite3.OperationalError as e:
            logger.warning(f"Ошибка создания таблицы: {e}")

    conn.commit()
    conn.close()

    if applied > 0:
        logger.info(f"Миграция завершена: применено {applied} изменений, пропущено {skipped}")
    else:
        logger.debug(f"Миграция: все колонки уже существуют, пропущено {skipped}")
