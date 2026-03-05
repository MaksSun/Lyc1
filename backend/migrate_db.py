#!/usr/bin/env python3
"""
Скрипт для ручного запуска миграции базы данных.
Запустите его, если после обновления проекта появляются ошибки
"table X has no column named Y".

Использование:
    python migrate_db.py
или:
    python migrate_db.py --db-path /путь/к/вашей/app.db
"""
import sys
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# Добавляем папку app в путь поиска
sys.path.insert(0, os.path.dirname(__file__))

def main():
    db_path = "./app/app.db"
    
    # Проверяем аргументы командной строки
    if len(sys.argv) > 1 and sys.argv[1] == "--db-path":
        db_path = sys.argv[2]
    
    # Ищем БД в стандартных местах
    candidates = [
        "./app/app.db",
        "./app.db",
        "../app.db",
        "app/app.db",
    ]
    
    if not os.path.exists(db_path):
        for candidate in candidates:
            if os.path.exists(candidate):
                db_path = candidate
                break
    
    if not os.path.exists(db_path):
        print(f"ОШИБКА: База данных не найдена. Проверьте путь: {db_path}")
        print("Используйте: python migrate_db.py --db-path /путь/к/app.db")
        sys.exit(1)
    
    print(f"Запуск миграции для: {os.path.abspath(db_path)}")
    
    from app.migrate import run_migrations
    run_migrations(db_path)
    print("Миграция завершена успешно!")

if __name__ == "__main__":
    main()
