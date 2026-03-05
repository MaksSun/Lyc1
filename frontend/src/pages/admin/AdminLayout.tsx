import { useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
  Box, Drawer, AppBar, Toolbar, Typography, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, IconButton, Avatar,
  Divider, useTheme, useMediaQuery, Collapse, Chip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SchoolIcon from "@mui/icons-material/School";
import PeopleIcon from "@mui/icons-material/People";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TableChartIcon from "@mui/icons-material/TableChart";
import BarChartIcon from "@mui/icons-material/BarChart";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import PollIcon from "@mui/icons-material/Poll";
import CodeIcon from "@mui/icons-material/Code";
import WifiIcon from "@mui/icons-material/Wifi";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { setAdminToken } from "../../auth";

const DRAWER_WIDTH = 260;

type NavItem = {
  label: string;
  icon: JSX.Element;
  path: string;
  children?: NavItem[];
  badge?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Классы", icon: <SchoolIcon />, path: "/admin/classes" },
  { label: "Ученики", icon: <PeopleIcon />, path: "/admin/students" },
  { label: "Расписание", icon: <CalendarMonthIcon />, path: "/admin/schedule" },
  { label: "Журнал", icon: <TableChartIcon />, path: "/admin/journal" },
  { label: "Результаты", icon: <BarChartIcon />, path: "/admin/results" },
  { label: "Онлайн-класс", icon: <WifiIcon />, path: "/admin/online" },
  { label: "Материалы", icon: <MenuBookIcon />, path: "/admin/materials" },
  { label: "Тесты и анкеты", icon: <PollIcon />, path: "/admin/surveys" },
  { label: "YAML-редактор", icon: <CodeIcon />, path: "/admin/yaml" },
];

function NavListItem({
  item,
  depth = 0,
  onClose,
}: {
  item: NavItem;
  depth?: number;
  onClose: () => void;
}) {
  const location = useLocation();
  const active = location.pathname.startsWith(item.path);
  const [open, setOpen] = useState(active);

  if (item.children) {
    return (
      <>
        <ListItem disablePadding sx={{ px: 1, mb: 0.5 }}>
          <ListItemButton
            onClick={() => setOpen(!open)}
            sx={{ borderRadius: 2, pl: 1 + depth * 2 }}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </ListItemButton>
        </ListItem>
        <Collapse in={open}>
          <List disablePadding>
            {item.children.map((child) => (
              <NavListItem key={child.path} item={child} depth={depth + 1} onClose={onClose} />
            ))}
          </List>
        </Collapse>
      </>
    );
  }

  return (
    <ListItem disablePadding sx={{ px: 1, mb: 0.5 }}>
      <ListItemButton
        component={Link}
        to={item.path}
        selected={active}
        onClick={onClose}
        sx={{
          borderRadius: 2,
          pl: 1 + depth * 2,
          "&.Mui-selected": {
            bgcolor: "primary.main",
            color: "white",
            "& .MuiListItemIcon-root": { color: "white" },
            "&:hover": { bgcolor: "primary.dark" },
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{ fontWeight: active ? 600 : 400, fontSize: 14 }}
        />
        {item.badge && (
          <Chip label={item.badge} size="small" color="success" sx={{ height: 18, fontSize: 10 }} />
        )}
      </ListItemButton>
    </ListItem>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    setAdminToken(null);
    navigate("/admin/login");
  };

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Логотип школы */}
      <Box
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          background: "linear-gradient(135deg, #1a3a6b 0%, #1565c0 100%)",
          color: "white",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
          <Box
            component="img"
            src="/lyceum_logo.png"
            alt="Лицей №1"
            sx={{
              width: 48,
              height: 48,
              borderRadius: 1,
              objectFit: "contain",
              bgcolor: "white",
              p: 0.3,
              flexShrink: 0,
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <Box>
            <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2} sx={{ color: "white" }}>
              МАОУ «Лицей №1»
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>
              Панель управления
            </Typography>
          </Box>
        </Box>
      </Box>
      <Divider />

      {/* Навигация */}
      <List sx={{ flex: 1, pt: 1, overflowY: "auto" }}>
        {NAV_ITEMS.map((item) => (
          <NavListItem
            key={item.path}
            item={item}
            onClose={() => setMobileOpen(false)}
          />
        ))}
      </List>

      <Divider />
      <List sx={{ pb: 1 }}>
        <ListItem disablePadding sx={{ px: 1 }}>
          <ListItemButton onClick={handleLogout} sx={{ borderRadius: 2 }}>
            <ListItemIcon sx={{ minWidth: 38 }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Выйти" primaryTypographyProps={{ fontSize: 14 }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {isMobile && (
        <AppBar
          position="fixed"
          sx={{
            zIndex: theme.zIndex.drawer + 1,
            background: "linear-gradient(135deg, #1a3a6b 0%, #1565c0 100%)",
          }}
        >
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Box
              component="img"
              src="/lyceum_logo.png"
              alt=""
              sx={{ width: 32, height: 32, mr: 1, objectFit: "contain", bgcolor: "white", borderRadius: 0.5, p: 0.2 }}
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; }}
            />
            <Typography variant="h6" fontWeight={700}>
              МАОУ «Лицей №1»
            </Typography>
          </Toolbar>
        </AppBar>
      )}

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" } }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{
              "& .MuiDrawer-paper": {
                width: DRAWER_WIDTH,
                boxSizing: "border-box",
                borderRight: "1px solid",
                borderColor: "divider",
              },
            }}
            open
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          mt: { xs: 8, md: 0 },
          bgcolor: "background.default",
          minHeight: "100vh",
          overflow: "auto",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
