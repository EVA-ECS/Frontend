// =============================================================================
// GEMEINSAME DESIGN-WERTE
// Hier liegen wiederverwendbare Farben, Schriftarten und Abstände. Der aktuelle
// Chat-Workspace besitzt zusätzlich eigene lokale Styles in chat-workspace.tsx.
// =============================================================================

// Lädt die globalen CSS-Schriftvariablen für die Web-Version.
import '@/global.css';

import { Platform } from 'react-native';

// Helle und dunkle Grundfarben für Komponenten, die das globale Theme nutzen.
export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

// Erlaubt in TypeScript nur Farbnamen, die in beiden Themes existieren.
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Jede Plattform erhält passende Systemschriftarten. Im Web zeigen die Werte auf
// die CSS-Variablen aus global.css.
export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

// Einheitliche Abstandsskala statt zufälliger Werte in jeder Komponente.
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Zusätzlicher Platz für native Tab-Bars sowie maximale Breite für Inhalte.
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
