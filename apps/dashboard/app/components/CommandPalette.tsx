"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Search, Settings, Activity, Database, FileText, ChevronRight,
  Command, X, ArrowUp, ArrowDown, CornerDownLeft
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  category?: "navigation" | "actions" | "settings";
  shortcut?: string;
}

const commands: CommandItem[] = [
  {
    id: "home",
    label: "Go to Dashboard",
    description: "View the main dashboard",
    icon: <Home size={16} />,
    action: () => {},
    category: "navigation",
    shortcut: "G D",
  },
  {
    id: "live",
    label: "Live Mode",
    description: "Watch real-time agent execution",
    icon: <Activity size={16} />,
    action: () => {},
    category: "navigation",
    shortcut: "G L",
  },
  {
    id: "cache",
    label: "Trace Cache",
    description: "Browse cached traces",
    icon: <Database size={16} />,
    action: () => {},
    category: "navigation",
    shortcut: "G T",
  },
  {
    id: "compare",
    label: "Compare Traces",
    description: "Side-by-side comparison",
    icon: <FileText size={16} />,
    action: () => {},
    category: "navigation",
    shortcut: "G C",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Configure preferences",
    icon: <Settings size={16} />,
    action: () => {},
    category: "settings",
    shortcut: "G S",
  },
];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description?.toLowerCase().includes(query.toLowerCase()) ||
      cmd.keywords?.some((k) => k.toLowerCase().includes(query.toLowerCase()))
  );

  const handleSelect = useCallback(
    (command: CommandItem) => {
      command.action();
      setIsOpen(false);
      setQuery("");
    },
    []
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyNavigation = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredCommands[selectedIndex]);
      }
    },
    [filteredCommands, selectedIndex, handleSelect]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="command-palette-overlay"
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ duration: 0.15 }}
            className="command-palette-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-palette-input-wrapper">
              <Search size={18} className="command-palette-search-icon" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search commands..."
                className="command-palette-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyNavigation}
              />
              <kbd className="command-palette-kbd">ESC</kbd>
            </div>

            <div className="command-palette-list">
              {filteredCommands.map((command, index) => (
                <button
                  key={command.id}
                  className={`command-palette-item ${
                    index === selectedIndex ? "command-palette-item-selected" : ""
                  }`}
                  onClick={() => handleSelect(command)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="command-palette-item-icon">{command.icon}</span>
                  <div className="command-palette-item-content">
                    <span className="command-palette-item-label">{command.label}</span>
                    {command.description && (
                      <span className="command-palette-item-description">
                        {command.description}
                      </span>
                    )}
                  </div>
                  {command.shortcut && (
                    <span className="command-palette-item-shortcut">
                      {command.shortcut}
                    </span>
                  )}
                  <ChevronRight size={14} className="command-palette-item-arrow" />
                </button>
              ))}

              {filteredCommands.length === 0 && (
                <div className="command-palette-empty">
                  No commands found
                </div>
              )}
            </div>

            <div className="command-palette-footer">
              <div className="command-palette-hint">
                <ArrowUp size={12} /> <ArrowDown size={12} />
                <span>to navigate</span>
              </div>
              <div className="command-palette-hint">
                <CornerDownLeft size={12} />
                <span>to select</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}