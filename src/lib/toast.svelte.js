// A short notice at the bottom of the screen that says what was just saved, then leaves by itself.
export const toast = $state({ text: '', visible: false, id: 0 });

let timer;
export function notify(text, ms = 3000) {
  clearTimeout(timer);
  toast.text = text;
  toast.visible = true;
  toast.id++;
  timer = setTimeout(() => { toast.visible = false; }, ms);
}
