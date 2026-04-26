"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, GitBranch, Database, Settings, BookOpen, Moon, Sun } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("agentglass-theme");
    if (stored === "light") {
      setTheme("light");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("agentglass-theme", newTheme);
  };

  const links = [
    { name: "Live Graph", href: "/live", icon: Activity },
    { name: "Compare Traces", href: "/compare", icon: GitBranch },
    { name: "Cache Manager", href: "/cache", icon: Database },
    { name: "Settings", href: "/settings", icon: Settings },
    { name: "Documentation", href: "/docs", icon: BookOpen },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">◇</span>
      </div>
      <nav className="sidebar-nav" style={{ flex: 1 }}>
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className={`sidebar-link ${isActive ? "active" : ""}`}>
              <Icon size={20} className="sidebar-icon" />
              <span className="sidebar-label">{link.name}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="sidebar-footer" style={{ paddingBottom: "16px", width: "100%", paddingLeft: "12px", paddingRight: "12px" }}>
        <button 
          onClick={toggleTheme} 
          className="sidebar-link" 
          style={{ width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
        >
          {theme === "dark" ? <Sun size={20} className="sidebar-icon" /> : <Moon size={20} className="sidebar-icon" />}
          <span className="sidebar-label">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>
    </aside>
  );
}
