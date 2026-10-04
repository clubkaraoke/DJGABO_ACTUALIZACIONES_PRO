import type { Config } from "tailwindcss";
export default {
  content:["./index.html","./src/**/*.{ts,tsx}"],
  theme:{extend:{colors:{
    background:"#0A0A0B",foreground:"#F5F5F7",card:"#101012",popover:"#17171B",sidebar:"#0A0A0B",
    primary:{DEFAULT:"#FFD60A",foreground:"#0A0A0B"},secondary:"#17171B",muted:"#1F1F24","muted-foreground":"#6B6B72",
    carbon:{DEFAULT:"#0A0A0B",raised:"#101012"},graphite:{DEFAULT:"#17171B",elevated:"#1F1F24",border:"rgba(255,255,255,0.06)"},
    accent:{DEFAULT:"#FFD60A",hover:"#F5C900",soft:"rgba(255,214,10,0.12)"},ink:{DEFAULT:"#F5F5F7",secondary:"#A1A1A6",tertiary:"#6B6B72"},danger:"#EF4444",warning:"#F59E0B"
  },fontFamily:{display:["Inter","system-ui","sans-serif"],sans:["Inter","system-ui","sans-serif"],mono:["JetBrains Mono","monospace"]},borderRadius:{sm:"6px",md:"8px",lg:"10px",xl:"14px"},boxShadow:{card:"0 8px 24px rgba(0,0,0,.3)"}}},plugins:[]
} satisfies Config;
