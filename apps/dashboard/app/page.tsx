"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

const featureCards = [
  {
    title: "Deterministic Time-Travel",
    description: "Replay agent execution to an exact timestamp and inspect every span transition without guesswork.",
    icon: "⏳",
  },
  {
    title: "Local-First by Default",
    description: "Daemon, storage, and trace rendering run on your machine. No forced cloud telemetry or data egress.",
    icon: "🔒",
  },
  {
    title: "Execution Branching (GitFork)",
    description: "Compare traces side-by-side to evaluate prompt changes, tool behavior differences, and regressions quickly.",
    icon: "🔀",
  },
  {
    title: "God Mode Live Injection",
    description: "A real-time command REPL that lets you inject state, trigger tool calls, and override LLMs live.",
    icon: "⚡",
  },
  {
    title: "VCR LLM Cache",
    description: "Save real API dollars during iterative debugging. Deterministically cache API responses locally.",
    icon: "💾",
  },
  {
    title: "Local RCA & RAG X-Ray",
    description: "Ollama-powered root cause analysis and visual chunk inspection for vector searches.",
    icon: "🔍",
  }
];

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0a0e12] text-slate-200 overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Noise Texture */}
      <div 
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      />

      {/* Custom Cursor Glow */}
      <motion.div 
        className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-300"
        animate={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(16, 185, 129, 0.05), transparent 40%)`
        }}
      />

      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-[#0a0e12]/80 backdrop-blur-md border-b border-white/5">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-[#0a0e12] font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.5)] group-hover:shadow-[0_0_25px_rgba(16,185,129,0.8)] transition-all">
            ◇
          </div>
          <span className="font-semibold tracking-tight text-white">AgentGlass</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono ml-2">v2.0</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <Link href="/docs" className="hover:text-white transition-colors">Documentation</Link>
          <a href="https://github.com/VishalPainjane/AgentGlass" className="hover:text-white transition-colors">GitHub</a>
          <Link href="/live" className="px-4 py-2 rounded-md bg-white text-black hover:bg-slate-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            Open App
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 pt-32 pb-24 px-6 flex flex-col items-center text-center min-h-[90vh] justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-slate-300 mb-8 backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            AgentGlass V2 is now live
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6 leading-[1.1]">
            Debug autonomous agents <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              like you debug code.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            The local-first observability and time-travel debugger for multi-agent systems. 
            Isolate root causes, fork execution paths, and inject state in real-time.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Link href="/live" className="group relative px-6 py-3 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] overflow-hidden">
              <span className="relative z-10">Start Debugging</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            </Link>
            <div className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-mono text-sm flex items-center gap-3 backdrop-blur-sm">
              <span className="text-slate-500">$</span> pip install agentglass-python
            </div>
          </div>
        </motion.div>

        {/* App Preview Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
          style={{ y }}
          className="mt-24 w-full max-w-5xl rounded-xl border border-white/10 bg-[#0f172a]/80 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-xl overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          <div className="h-10 border-b border-white/10 flex items-center px-4 gap-2 bg-black/20">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            <div className="mx-auto text-xs text-slate-500 font-mono">AgentGlass Workspace</div>
          </div>
          <div className="p-8 aspect-video flex items-center justify-center relative overflow-hidden">
            {/* Subtle grid background */}
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            <div className="text-center relative z-10">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full border border-emerald-500/30 flex items-center justify-center bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.2)] relative">
                <span className="text-4xl z-10 relative">✨</span>
                {/* Glowing ring animation */}
                <div className="absolute inset-0 rounded-full border border-emerald-500/50 animate-ping" style={{ animationDuration: '3s' }}></div>
              </div>
              <p className="text-slate-400 font-mono text-sm">Waiting for agent telemetry...</p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Bento Grid Features */}
      <section className="relative z-10 py-32 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight">Production-grade visibility. <br/><span className="text-slate-500">Zero cloud egress.</span></h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Everything you need to deeply understand, debug, and optimize your LLM orchestration, entirely on your local machine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureCards.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-3xl mb-4 p-3 rounded-lg bg-white/5 inline-block border border-white/5 relative z-10">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3 tracking-tight relative z-10">{feature.title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm relative z-10">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>
      
      {/* Footer CTA */}
      <footer className="relative z-10 border-t border-white/5 py-20 mt-20 text-center bg-gradient-to-b from-transparent to-[#05080a]">
        <h2 className="text-3xl font-bold text-white mb-6 tracking-tight">Ready to see clearly?</h2>
        <div className="flex items-center justify-center gap-4">
          <Link href="/docs" className="px-6 py-3 rounded-lg bg-white text-black font-medium hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            Read the Docs
          </Link>
          <a href="https://github.com/VishalPainjane/AgentGlass" className="px-6 py-3 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5 transition-all">
            View on GitHub
          </a>
        </div>
        <p className="mt-16 text-sm text-slate-600 font-mono">© 2026 AgentGlass. Local-first observability.</p>
      </footer>
    </div>
  );
}
