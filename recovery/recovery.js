/* BIP39 suggestions use the bundled English word list and explicit choices only. */
(function () {
  'use strict';
  const input = document.getElementById('phrase');
  const list = document.getElementById('phrase-suggestions');
  const words = Array.from({ length: 2048 }, (_, index) => ethers.wordlists.en.getWord(index));
  let choices = [], selected = 0, composing = false;
  function hide() {
    choices = []; list.replaceChildren(); list.hidden = true;
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  }
  function range() {
    const caret = input.selectionStart, end = input.selectionEnd;
    if (caret !== end) return null;
    let start = caret, finish = end;
    while (start > 0 && !/\s/.test(input.value[start - 1])) start--;
    while (finish < input.value.length && !/\s/.test(input.value[finish])) finish++;
    const prefix = input.value.slice(start, caret).normalize('NFKD').toLowerCase();
    return /^[a-z]+$/.test(prefix) ? { start, finish, prefix } : null;
  }
  function choose(word) {
    const active = range();
    if (!active || !choices.includes(word) || !word.startsWith(active.prefix)) return;
    const after = input.value.slice(active.finish);
    const space = after ? '' : ' ';
    input.value = input.value.slice(0, active.start) + word + space + after;
    const caret = active.start + word.length + (after ? 1 : space.length);
    input.focus({ preventScroll: true }); input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hide();
  }
  function highlight() {
    list.querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-selected', String(index === selected)));
    input.setAttribute('aria-activedescendant', 'recovery-choice-' + selected);
  }
  function refresh() {
    hide();
    if (composing || input.disabled || document.activeElement !== input) return;
    const active = range();
    if (!active) return;
    choices = words.filter(word => word.startsWith(active.prefix)).slice(0, 8);
    if (!choices.length) return;
    selected = 0;
    for (const [index, word] of choices.entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'recovery-choice'; button.id = 'recovery-choice-' + index;
      button.textContent = word; button.setAttribute('role', 'option'); button.tabIndex = -1;
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => choose(word)); list.append(button);
    }
    list.hidden = false; input.setAttribute('aria-expanded', 'true'); highlight();
  }
  for (const event of ['input', 'focus', 'click', 'select']) input.addEventListener(event, refresh);
  input.addEventListener('compositionstart', () => { composing = true; hide(); });
  input.addEventListener('compositionend', () => { composing = false; refresh(); });
  input.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refresh(); });
  input.addEventListener('keydown', event => {
    if (composing || list.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length; highlight();
    } else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(choices[selected]); }
  });
  input.addEventListener('blur', () => setTimeout(hide, 0));
  window.addEventListener('pagehide', hide);
})();
