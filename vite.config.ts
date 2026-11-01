import { defineConfig } from 'vite';

// GitHub Pages sert le site sous /power-combat/ ; en dev on reste à la racine.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/power-combat/' : '/',
}));
