require("dotenv").config();
const enablePurge = process.env.ENABLE_PURGE;
module.exports = {
  important: true,
  prefix: '',
  purge: {
    enabled: enablePurge,
    content: [
      './src/**/*.{html,ts}',
    ]
  },
  darkMode: 'class', // or 'media' or 'class'
  theme: {
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms'),require('@tailwindcss/typography')],
};
