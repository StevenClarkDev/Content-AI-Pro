import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Capacitor?: unknown;
  }
}

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");
const APP_SOURCE = window.Capacitor ? "android" : "portal";

type Tool = {
  id: string;
  icon: string;
  label: string;
  desc: string;
  platforms: string[];
  acceptsImage?: boolean;
  prompt: (platform: string, tone: string, keyword: string) => string;
};

type HistoryItem = {
  tool: string;
  platform: string;
  keyword: string;
  tone: string;
  output: string;
  time: string;
};

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  delay: number;
};

type GenerateResponse = {
  text?: string;
  error?: string;
};

type UploadedImage = {
  dataUrl: string;
  name: string;
};

const TOOLS: Tool[] = [
  {
    id: "social",
    icon: "✦",
    label: "Social Media",
    desc: "Viral posts for any platform",
    platforms: ["Instagram", "LinkedIn", "Twitter/X", "TikTok", "Facebook"],
    prompt: (p, tone, kw) =>
      `Write 6 high-performing ${p} posts for a brand in the ${kw} niche. Tone: ${tone}. Include overlay text, body, and relevant hashtags. Make them scroll-stopping and platform-native. Format each post clearly labeled Post 1, Post 2, Post 3, Post 4, Post 5, Post 6.`,
  },
  {
    id: "email",
    icon: "◈",
    label: "Email Sequences",
    desc: "Convert subscribers to buyers",
    platforms: ["Welcome Series", "Sales Funnel", "Re-engagement", "Newsletter", "Cold Outreach"],
    prompt: (p, tone, kw) =>
      `Write a 3-email ${p} sequence for a ${kw} business. Tone: ${tone}. Include subject lines, preview text, and body copy. Each email should have a clear purpose and CTA. Format as Email 1, Email 2, Email 3 with all components labeled.`,
  },
  {
    id: "ads",
    icon: "◇",
    label: "Ad Copy",
    desc: "High-converting paid ads",
    platforms: ["Google Search", "Facebook/Meta", "Instagram Story", "YouTube Pre-roll", "LinkedIn Sponsored"],
    prompt: (p, tone, kw) =>
      `Write 3 high-converting ${p} ad variations for a ${kw} product/service. Tone: ${tone}. Include headlines, descriptions, and CTAs. Follow platform best practices. Label as Ad Variant A, B, C.`,
  },
  {
    id: "product",
    icon: "◉",
    label: "Product Copy",
    desc: "Descriptions that sell",
    platforms: ["Amazon Listing", "Shopify Product", "Etsy Description", "Landing Page", "App Store"],
    prompt: (p, tone, kw) =>
      `Write compelling ${p} product copy for a ${kw} product. Tone: ${tone}. Include: a punchy title, a benefit-driven description, key features as bullet points, and a strong CTA. Make it SEO-friendly and conversion-optimized.`,
  },
  {
    id: "proposal",
    icon: "◐",
    label: "Business Proposals",
    desc: "Win clients effortlessly",
    platforms: ["Freelance Proposal", "Agency Pitch", "Partnership Deck", "Investor Brief", "Grant Application"],
    prompt: (p, tone, kw) =>
      `Write a professional ${p} for a ${kw} business. Tone: ${tone}. Structure: Executive Summary, Problem Statement, Proposed Solution, Deliverables, Timeline, Pricing Overview, and Next Steps. Make it persuasive and polished.`,
  },
  {
    id: "bio",
    icon: "◑",
    label: "Brand Bios",
    desc: "Authority bios & about pages",
    platforms: ["LinkedIn Bio", "Instagram Bio", "Speaker Bio", "Author Bio", "Website About Page"],
    prompt: (p, tone, kw) =>
      `Write 3 versions of a ${p} for a professional in the ${kw} industry. Tone: ${tone}. Versions: Short (under 50 words), Medium (100 words), Long (200 words). Each should establish authority, personality, and a clear value proposition.`,
  },
  {
    id: "image",
    icon: "IMG",
    label: "Image Content",
    desc: "Generate captions and copy from an image",
    platforms: ["Caption Ideas", "Product Description", "Alt Text", "Ad Creative", "Social Post"],
    acceptsImage: true,
    prompt: (p, tone, kw) =>
      `Analyze the uploaded image and create ${p} for ${kw}. Tone: ${tone}. Describe what is visible, infer the likely product or context, and write polished copy the user can publish or adapt immediately.`,
  },
  {
    id: "seo",
    icon: "SEO",
    label: "SEO Content",
    desc: "Search-friendly outlines and copy",
    platforms: ["Blog Outline", "Meta Title", "Meta Description", "Keyword Brief", "FAQ Section"],
    prompt: (p, tone, kw) =>
      `Create ${p} content for the ${kw} niche. Tone: ${tone}. Make it search-friendly, clear, and useful. Include concise recommendations and practical copy the user can publish or adapt immediately.`,
  },
];

const TONES = ["Professional", "Conversational", "Bold & Direct", "Luxury/Premium", "Friendly & Warm", "Urgent & Persuasive"];

export default function ContentAIPro() {
  const [activeTool, setActiveTool] = useState(TOOLS[0]);
  const [platform, setPlatform] = useState(TOOLS[0].platforms[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [keyword, setKeyword] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);

  useEffect(() => {
    const p = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 20 + 10,
      delay: Math.random() * 5,
    }));
    setParticles(p);
  }, []);

  useEffect(() => {
    setPlatform(activeTool.platforms[0]);
    setOutput("");
    setError("");
    if (!activeTool.acceptsImage) {
      setUploadedImage(null);
    }
  }, [activeTool]);

  useEffect(() => {
    setCharCount(output.length);
  }, [output]);

  const generate = async () => {
    if (!keyword.trim()) {
      setError("Please enter your niche or topic first.");
      return;
    }
    if (activeTool.acceptsImage && !uploadedImage) {
      setError("Please upload an image first.");
      return;
    }
    setLoading(true);
    setError("");
    setOutput("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activeTool.prompt(platform, tone, keyword),
          source: APP_SOURCE,
          tool: activeTool.label,
          platform,
          tone,
          keyword,
          imageData: uploadedImage?.dataUrl,
          imageName: uploadedImage?.name,
        }),
      });

      const data = (await res.json()) as GenerateResponse;
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const text = data.text || "";
      setOutput(text);
      setHistory((prev) => [
        { tool: activeTool.label, platform, keyword, tone, output: text, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyOutput = async () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImageUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("Please upload an image under 6 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Could not read that image. Please try another one.");
        return;
      }
      setUploadedImage({ dataUrl: reader.result, name: file.name });
      setError("");
    };
    reader.onerror = () => {
      setError("Could not read that image. Please try another one.");
    };
    reader.readAsDataURL(file);
  };

  const clearUploadedImage = () => {
    setUploadedImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #080a0e;
          --surface: #0e1117;
          --border: #1e2535;
          --gold: #ef8137;
          --gold-light: #ffad72;
          --gold-dim: rgba(239,129,55,0.15);
          --text: #e8e4d9;
          --muted: #6b7280;
          --accent: #3b82f6;
          --header-bg: rgba(8,10,14,0.8);
          --sidebar-bg: rgba(14,17,23,0.6);
          --panel-bg: rgba(14,17,23,0.5);
          --select-option-bg: #0e1117;
          --button-text: #080a0e;
          --mesh-gold: rgba(239,129,55,0.07);
          --mesh-blue: rgba(59,130,246,0.05);
          --mesh-soft: rgba(180,76,24,0.04);
        }

        .app.light {
          --bg: #f7f4ec;
          --surface: #fffaf0;
          --border: #ded2b7;
          --gold: #c45a20;
          --gold-light: #8f3f17;
          --gold-dim: rgba(196,90,32,0.12);
          --text: #17140f;
          --muted: #6f6659;
          --accent: #2563eb;
          --header-bg: rgba(247,244,236,0.86);
          --sidebar-bg: rgba(255,250,240,0.68);
          --panel-bg: rgba(255,250,240,0.62);
          --select-option-bg: #fffaf0;
          --button-text: #fffaf0;
          --mesh-gold: rgba(196,90,32,0.12);
          --mesh-blue: rgba(37,99,235,0.07);
          --mesh-soft: rgba(143,63,23,0.06);
        }

        .app {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .bg-mesh {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: 
            radial-gradient(ellipse 60% 40% at 20% 20%, var(--mesh-gold) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 80% 80%, var(--mesh-blue) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 50% 50%, var(--mesh-soft) 0%, transparent 70%);
        }

        .particle {
          position: fixed;
          border-radius: 50%;
          background: var(--gold);
          opacity: 0.25;
          pointer-events: none;
          animation: float linear infinite;
          z-index: 0;
        }

        @keyframes float {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.25; }
          90% { opacity: 0.15; }
          100% { transform: translateY(-10vh) rotate(360deg); opacity: 0; }
        }

        .main-grid {
          position: relative; z-index: 1;
          display: grid;
          grid-template-columns: 260px 1fr 320px;
          grid-template-rows: auto 1fr;
          min-height: 100vh;
          gap: 0;
        }

        .header {
          grid-column: 1 / -1;
          min-height: 124px;
          padding: 18px 28px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--header-bg);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 100;
        }

        .logo {
          display: flex;
          align-items: center;
          width: 250px;
          height: 72px;
          background: transparent;
          border: 0;
          padding: 0;
        }

        .logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: left center;
          display: block;
        }

        .header-badge {
          background: var(--gold-dim);
          border: 1px solid rgba(239,129,55,0.3);
          color: var(--gold-light);
          padding: 5px 14px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .header-right {
          display: flex; align-items: center; gap: 16px;
        }

        .history-btn, .theme-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 7px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
        }

        .history-btn:hover, .theme-btn:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        /* Sidebar */
        .sidebar {
          border-right: 1px solid var(--border);
          padding: 24px 16px;
          background: var(--sidebar-bg);
          display: flex; flex-direction: column; gap: 4px;
          overflow-y: auto;
        }

        .sidebar-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 0 10px;
          margin-bottom: 8px;
          margin-top: 4px;
        }

        .tool-btn {
          width: 100%;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 12px 14px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
          display: flex; align-items: flex-start; gap: 12px;
          font-family: 'DM Sans', sans-serif;
        }

        .tool-btn:hover {
          background: rgba(255,255,255,0.03);
          border-color: var(--border);
        }

        .tool-btn.active {
          background: var(--gold-dim);
          border-color: rgba(239,129,55,0.35);
        }

        .tool-icon {
          font-size: 20px;
          color: var(--muted);
          line-height: 1;
          margin-top: 1px;
          min-width: 20px;
        }

        .tool-btn.active .tool-icon { color: var(--gold); }

        .tool-info { flex: 1; }
        .tool-name {
          font-size: 14px; font-weight: 500;
          color: var(--text);
          display: block; margin-bottom: 2px;
        }
        .tool-desc {
          font-size: 11px; color: var(--muted);
          display: block;
        }

        /* Center content */
        .center {
          padding: 32px;
          display: flex; flex-direction: column; gap: 0;
          overflow-y: auto;
        }

        .section-title {
          font-family: 'Playfair Display', serif;
          font-size: 28px; font-weight: 700;
          color: var(--text);
          margin-bottom: 6px;
          letter-spacing: -0.02em;
        }

        .section-subtitle {
          font-size: 14px; color: var(--muted);
          margin-bottom: 28px;
        }

        .input-group {
          margin-bottom: 20px;
        }

        .input-label {
          display: block;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }

        .text-input {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 16px;
          color: var(--text);
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s;
        }

        .text-input::placeholder { color: var(--muted); }
        .text-input:focus { border-color: var(--gold); }
        textarea.text-input { resize: vertical; min-height: 96px; line-height: 1.55; }

        .grid-2 {
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
          margin-bottom: 20px;
        }

        .select-input {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 13px 16px;
          color: var(--text);
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          cursor: pointer;
          appearance: none;
          background-repeat: no-repeat;
          background-position: right 14px center;
          transition: border-color 0.2s;
        }

        .select-input option { background: var(--select-option-bg); }
        .select-input:focus { border-color: var(--gold); }

        .upload-zone {
          background: var(--surface);
          border: 1px dashed rgba(239,129,55,0.45);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .upload-copy {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .upload-title {
          color: var(--text);
          font-size: 14px;
          font-weight: 600;
        }

        .upload-note {
          color: var(--muted);
          font-size: 12px;
        }

        .upload-btn,
        .remove-image-btn {
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          padding: 8px 12px;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .upload-btn:hover,
        .remove-image-btn:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        .image-preview {
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
          background: var(--surface);
        }

        .image-preview img {
          display: block;
          width: 100%;
          max-height: 240px;
          object-fit: contain;
          background: rgba(0,0,0,0.18);
        }

        .image-preview-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          color: var(--muted);
          font-size: 12px;
        }

        .generate-btn {
          width: 100%;
          background: linear-gradient(135deg, #b44c18 0%, #ef8137 50%, #b44c18 100%);
          background-size: 200% 200%;
          border: none;
          border-radius: 12px;
          padding: 16px;
          color: var(--button-text);
          font-size: 15px;
          font-weight: 700;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: all 0.3s;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          margin-bottom: 24px;
          text-transform: uppercase;
        }

        .generate-btn:hover:not(:disabled) {
          background-position: 100% 100%;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(239,129,55,0.35);
        }

        .generate-btn:disabled {
          opacity: 0.6; cursor: not-allowed; transform: none;
        }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(0,0,0,0.3);
          border-top-color: #080a0e;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .output-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          flex: 1;
        }

        .output-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }

        .output-title {
          font-size: 12px; font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .output-actions {
          display: flex; gap: 8px; align-items: center;
        }

        .char-count {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          color: var(--muted);
        }

        .copy-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 5px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
        }

        .copy-btn:hover { border-color: var(--gold); color: var(--gold); }
        .copy-btn.copied { border-color: #22c55e; color: #22c55e; }

        .output-content {
          padding: 20px;
          min-height: 280px;
          max-height: 420px;
          overflow-y: auto;
          font-size: 14px;
          line-height: 1.75;
          color: var(--text);
          white-space: pre-wrap;
          font-family: 'DM Sans', sans-serif;
        }

        .output-placeholder {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          height: 280px;
          gap: 12px;
          color: var(--muted);
          text-align: center;
        }

        .placeholder-icon {
          font-size: 36px; opacity: 0.3;
        }

        .placeholder-text {
          font-size: 14px;
        }

        .error-msg {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #f87171;
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 16px;
        }

        /* Right panel */
        .right-panel {
          border-left: 1px solid var(--border);
          padding: 24px 20px;
          background: var(--panel-bg);
          overflow-y: auto;
        }

        .panel-section {
          margin-bottom: 28px;
        }

        .panel-heading {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 14px;
          display: flex; align-items: center; gap: 8px;
        }

        .panel-heading::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .stat-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }

        .stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 12px;
          text-align: center;
        }

        .stat-value {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 700;
          color: var(--gold);
          display: block;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 10px; color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .pricing-card {
          background: var(--gold-dim);
          border: 1px solid rgba(239,129,55,0.25);
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 12px;
        }

        .pricing-tier {
          font-size: 12px; font-weight: 600;
          color: var(--gold);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
        }

        .pricing-price {
          font-family: 'Playfair Display', serif;
          font-size: 26px; font-weight: 900;
          color: var(--text);
          margin-bottom: 2px;
        }

        .pricing-note { font-size: 12px; color: var(--muted); margin-bottom: 12px; }

        .feature-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .feature-item {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; color: var(--text);
        }
        .feature-dot {
          width: 4px; height: 4px; border-radius: 50%;
          background: var(--gold); flex-shrink: 0;
        }

        .income-strip {
          background: linear-gradient(135deg, rgba(239,129,55,0.12), rgba(180,76,24,0.06));
          border: 1px solid rgba(239,129,55,0.2);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
        }

        .income-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
        .income-value { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--gold-light); font-weight: 700; }

        .platform-tags {
          display: flex; flex-wrap: wrap; gap: 6px;
        }

        .platform-tag {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 4px 10px;
          font-size: 11px;
          color: var(--muted);
        }

        .history-panel {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(8,10,14,0.9);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
        }

        .history-modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 620px; max-width: 90vw;
          max-height: 70vh;
          overflow-y: auto;
          padding: 28px;
        }

        .history-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px;
        }

        .close-btn {
          background: transparent; border: 1px solid var(--border);
          color: var(--muted); padding: 6px 12px; border-radius: 8px;
          cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px;
          transition: all 0.2s;
        }

        .close-btn:hover { border-color: #ef4444; color: #ef4444; }

        .history-item {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .history-item:hover { border-color: var(--gold); }
        .history-meta { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
        .history-preview { font-size: 13px; color: var(--text); line-height: 1.5; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .fade-in { animation: fadeIn 0.4s ease forwards; }

        @media (max-width: 900px) {
          .main-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
          .right-panel, .sidebar { display: none; }
          .center { padding: 20px; }
        }
      `}</style>

      <div className={`app ${isLightMode ? "light" : ""}`}>
        <div className="bg-mesh" />
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.x}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.speed}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        {showHistory && (
          <div className="history-panel" onClick={() => setShowHistory(false)}>
            <div className="history-modal" onClick={(e) => e.stopPropagation()}>
              <div className="history-modal-header">
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>
                  Generation History
                </span>
                <button className="close-btn" onClick={() => setShowHistory(false)}>Close</button>
              </div>
              {history.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 14 }}>No history yet. Generate some content first.</p>
              ) : (
                history.map((h, i) => (
                  <div
                    key={i}
                    className="history-item"
                    onClick={() => { setOutput(h.output); setShowHistory(false); }}
                  >
                    <div className="history-meta">
                      {h.tool} · {h.platform} · {h.tone} · {h.keyword} · {h.time}
                    </div>
                    <div className="history-preview">{h.output.slice(0, 120)}...</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="main-grid">
          {/* Header */}
          <header className="header">
            <div className="logo">
              <img
                className="logo-img"
                src={isLightMode ? "/content-ai-pro-logo-dark.png" : "/content-ai-pro-logo.png"}
                alt="Content AI Pro"
              />
            </div>
            <div className="header-badge">✦ Pro Suite</div>
            <div className="header-right">
              <button
                className="theme-btn"
                onClick={() => setIsLightMode((current) => !current)}
                type="button"
              >
                {isLightMode ? "Dark Mode" : "Light Mode"}
              </button>
              <button className="history-btn" onClick={() => setShowHistory(true)}>
                ◈ History ({history.length})
              </button>
            </div>
          </header>

          {/* Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-label">Content Tools</div>
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`tool-btn ${activeTool.id === t.id ? "active" : ""}`}
                onClick={() => setActiveTool(t)}
              >
                <span className="tool-icon">{t.icon}</span>
                <div className="tool-info">
                  <span className="tool-name">{t.label}</span>
                  <span className="tool-desc">{t.desc}</span>
                </div>
              </button>
            ))}
          </aside>

          {/* Center */}
          <main className="center">
            <div className="section-title">{activeTool.label}</div>
            <div className="section-subtitle">{activeTool.desc} — powered by Claude AI</div>

            <div className="input-group">
              <label className="input-label">Your Niche / Topic / Brand</label>
              <input
                className="text-input"
                placeholder="e.g. fitness coaching, SaaS startup, luxury skincare..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
              />
            </div>

            <div className="grid-2">
              <div>
                <label className="input-label">Platform / Format</label>
                <select
                  className="select-input"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  {activeTool.platforms.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Tone of Voice</label>
                <select
                  className="select-input"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                >
                  {TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {activeTool.acceptsImage && (
              <>
                <div className="upload-zone">
                  <div className="upload-copy">
                    <span className="upload-title">Upload image</span>
                    <span className="upload-note">PNG, JPG, WebP, or GIF under 6 MB</span>
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={(e) => handleImageUpload(e.target.files?.[0])}
                  />
                  <button
                    className="upload-btn"
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    Choose Image
                  </button>
                </div>

                {uploadedImage && (
                  <div className="image-preview">
                    <img src={uploadedImage.dataUrl} alt={uploadedImage.name} />
                    <div className="image-preview-meta">
                      <span>{uploadedImage.name}</span>
                      <button className="remove-image-btn" type="button" onClick={clearUploadedImage}>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {error && <div className="error-msg">{error}</div>}

            <button className="generate-btn" onClick={generate} disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner" />
                  Generating...
                </>
              ) : (
                <>✦ Generate Content</>
              )}
            </button>

            <div className="output-box">
              <div className="output-header">
                <span className="output-title">Output</span>
                <div className="output-actions">
                  {output && (
                    <>
                      <span className="char-count">{charCount} chars</span>
                      <button
                        className={`copy-btn ${copied ? "copied" : ""}`}
                        onClick={copyOutput}
                      >
                        {copied ? "✓ Copied" : "Copy All"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="output-content" ref={outputRef}>
                {output ? (
                  <div className="fade-in">{output}</div>
                ) : (
                  <div className="output-placeholder">
                    <div className="placeholder-icon">{activeTool.icon}</div>
                    <div className="placeholder-text">
                      Enter your niche and click Generate<br />
                      <span style={{ fontSize: 12, opacity: 0.6 }}>Results appear here instantly</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* Right Panel */}
          <aside className="right-panel">
            <div className="panel-section">
              <div className="panel-heading">Usage Stats</div>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-value">{history.length}</span>
                  <span className="stat-label">Generated</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{TOOLS.length}</span>
                  <span className="stat-label">Tools</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">∞</span>
                  <span className="stat-label">Exports</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">AI</span>
                  <span className="stat-label">Powered</span>
                </div>
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-heading">Income Model</div>
              <div className="income-strip">
                <div className="income-label">Target: $200/day</div>
                <div className="income-value">$29/mo × 210 users</div>
              </div>
              <div className="income-strip">
                <div className="income-label">Sell on Gumroad / LemonSqueezy</div>
                <div className="income-value">$49 lifetime deal</div>
              </div>
              <div className="income-strip">
                <div className="income-label">Monthly Recurring Revenue</div>
                <div className="income-value">$6,090 / month</div>
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-heading">Pricing Tier</div>
              <div className="pricing-card">
                <div className="pricing-tier">Pro Plan</div>
                <div className="pricing-price">$29<span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>/mo</span></div>
                <div className="pricing-note">Or $49 lifetime access</div>
                <ul className="feature-list">
                  {["7 AI Content Tools", "SEO Content Generator", "Unlimited Generations", "All Platforms & Tones", "Generation History", "One-click Copy", "Priority Support"].map((f) => (
                    <li key={f} className="feature-item">
                      <div className="feature-dot" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-heading">Where to Sell</div>
              <div className="platform-tags">
                {["Gumroad", "LemonSqueezy", "Shopify", "Etsy", "ProductHunt", "AppSumo", "Twitter/X", "LinkedIn"].map((p) => (
                  <span key={p} className="platform-tag">{p}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
