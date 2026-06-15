import type { ComponentType, ReactNode } from 'react';

export type AppManifest = {
  id: string;
  name: string;
  description: string;
  icon: string | ReactNode;
  type: 'iframe' | 'native';
  url?: string;
  component?: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
  componentProps?: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  allowMultiple?: boolean;
  githubRepo?: string;
};

export const apps: AppManifest[] = [
  {
    id: 'about',
    name: 'About Schmug',
    description: 'Bio, what I build, how to reach me.',
    icon: '/mark-sm.svg',
    type: 'native',
    component: () => import('../components/os/apps/AboutApp'),
    defaultSize: { w: 560, h: 560 },
    allowMultiple: false,
  },
  {
    id: 'projects',
    name: 'Projects',
    description: 'Everything I have shipped on GitHub.',
    icon: '📁',
    type: 'native',
    component: () => import('../components/os/apps/ProjectsApp'),
    defaultSize: { w: 760, h: 560 },
    allowMultiple: false,
  },
  {
    id: 'blog',
    name: 'Blog',
    description: 'Notes on tooling, Cloudflare, and CortechOS.',
    icon: '✍️',
    type: 'native',
    component: () => import('../components/os/apps/BlogApp'),
    defaultSize: { w: 760, h: 560 },
    minSize: { w: 480, h: 360 },
    allowMultiple: false,
  },
  {
    id: 'support',
    name: 'Support',
    description: 'Sponsor, tip, or star my work.',
    icon: '💛',
    type: 'native',
    component: () => import('../components/os/apps/SupportApp'),
    defaultSize: { w: 640, h: 620 },
    allowMultiple: false,
  },
  {
    id: 'dmarc-mx',
    name: 'dmarc.mx',
    description: 'Email security analyzer — DMARC, SPF, DKIM, BIMI, MTA-STS.',
    icon: '🛡️',
    type: 'iframe',
    url: 'https://dmarc.mx',
    defaultSize: { w: 960, h: 680 },
    minSize: { w: 480, h: 360 },
    githubRepo: 'schmug/dmarcheck',
  },
  {
    id: 'donthype-me',
    name: 'donthype.me',
    description: 'AI-powered RSS reader — analyzes clickbait and rewrites headlines.',
    icon: '📣',
    type: 'iframe',
    url: 'https://donthype.me',
    defaultSize: { w: 960, h: 680 },
    githubRepo: 'schmug/donthype-me',
  },
  {
    id: 'apartment-stager',
    name: 'apartment-stager',
    description: 'Browser-based floor-plan staging — no bundler, just HTML + Konva.',
    icon: '🏠',
    type: 'iframe',
    url: 'https://apartment-stager.pages.dev/',
    defaultSize: { w: 960, h: 680 },
    githubRepo: 'schmug/apartment-stager',
  },
  {
    id: 'qr-me',
    name: 'q-r.contact',
    description: 'Local QR code generator for contact cards — no tracking, works offline.',
    icon: '📇',
    type: 'iframe',
    url: 'https://q-r.contact',
    defaultSize: { w: 720, h: 720 },
    githubRepo: 'schmug/qr-me',
  },
  {
    id: 'mythos',
    name: 'Mythos tracker',
    description: 'Daily progress on vulnerabilities found by Claude Mythos Preview.',
    icon: '🔎',
    type: 'native',
    component: () => import('../components/os/apps/MythosApp'),
    defaultSize: { w: 760, h: 580 },
    minSize: { w: 480, h: 360 },
    allowMultiple: false,
  },
  {
    id: 'dmarcus',
    name: 'DMarcus',
    description: 'Your mascot learned a new dance.',
    icon: '🕺',
    type: 'native',
    component: () => import('../components/os/apps/DmarcusApp'),
    defaultSize: { w: 540, h: 600 },
    minSize: { w: 380, h: 460 },
    allowMultiple: false,
  },
];
