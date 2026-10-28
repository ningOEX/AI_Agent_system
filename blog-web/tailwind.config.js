/** @type {import('tailwindcss').Config} */
const brandShades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const brandOpacity = ['', '/10', '/15', '/20', '/30', '/40', '/50', '/60', '/70'];
const variants = ['', 'hover:', 'focus:', 'active:', 'dark:', 'dark:hover:'];

function safelist() {
  const out = [];
  for (const shade of brandShades) {
    for (const opacity of brandOpacity) {
      for (const v of variants) {
        out.push(`${v}bg-brand-${shade}${opacity}`);
        out.push(`${v}text-brand-${shade}${opacity}`);
        out.push(`${v}border-brand-${shade}${opacity}`);
        out.push(`${v}bg-accent-500${opacity}`);
        out.push(`${v}bg-accent-600${opacity}`);
        out.push(`${v}text-accent-500${opacity}`);
        out.push(`${v}text-accent-600${opacity}`);
        out.push(`${v}border-accent-500${opacity}`);
        out.push(`${v}border-accent-600${opacity}`);
      }
    }
  }
  for (const shade of brandShades) {
    out.push(`from-brand-${shade}`);
    out.push(`to-brand-${shade}`);
    out.push(`via-brand-${shade}`);
  }
  out.push('from-accent-500', 'from-accent-600', 'to-accent-500', 'to-accent-600');
  out.push('bg-hero-gradient', 'bg-logo-gradient');
  return [...new Set(out)];
}

// helper: generate rgb css var reference for a shade
function rgbVar(prefix, shade) {
  return `rgb(var(--tw-${prefix}-${shade}) / <alpha-value>)`;
}
function rgbVarPlain(prefix, shade) {
  return `rgb(var(--tw-${prefix}-${shade}))`;
}

function buildBrandShades() {
  const out = {};
  for (const s of brandShades) out[s] = rgbVar('brand', s);
  return out;
}

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  safelist: safelist(),
  theme: {
    extend: {
      fontFamily: {
        display: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: buildBrandShades(),
        accent: {
          500: rgbVar('accent', '500'),
          600: rgbVar('accent', '600'),
        },
      },
      backgroundImage: {
        'hero-gradient': `linear-gradient(135deg, ${rgbVarPlain('brand', '600')} 0%, ${rgbVarPlain('brand', '500')} 50%, ${rgbVarPlain('accent', '500')} 100%)`,
        'logo-gradient': `linear-gradient(135deg, ${rgbVarPlain('brand', '500')} 0%, rgb(var(--tw-brand-500) / 0.85) 50%, ${rgbVarPlain('accent', '500')} 100%)`,
      },
    },
  },
  plugins: [],
};
