import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Запекаем игру в один HTML-файл: JS и CSS вливаются внутрь index.html.
// Внешних ресурсов нет (графика — canvas, шрифты — системные, звук — синтез),
// поэтому запечённый файл работает откуда угодно: GitHub Pages, file:// и т.д.
export default defineConfig({
  plugins: [viteSingleFile()],
});
