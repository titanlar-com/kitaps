// A local `document` in one function does not make the real one elsewhere allowed.
export const local = () => { const document = { title: 'yerel' }; return document.title; };
export const real = () => document.title;
