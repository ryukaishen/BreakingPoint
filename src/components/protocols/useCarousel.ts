import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** True while the element scrolls sideways: Make's phone carousel. Wider screens lay the cards out instead. */
const sideways = (el: HTMLElement) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Make's touch carousel for the movement cards on phones. The selected card is kept centred
 * (a tap or arrow key selects it, then it slides to the middle), and a swipe selects whichever
 * card comes to rest in the middle. `cards` picks the selectable children; other children (the
 * locked custom-protocol card in the library) scroll with them but are never selected. `mount` names
 * the carousel element's current instance: change it when the element is remounted.
 */
export function useCarousel(ref: RefObject<HTMLElement>, selected: number, onSettle: (index: number) => void, cards: string, mount: string) {
  const settle = useRef(onSettle);
  settle.current = onSettle;

  // Centre the selected card whenever the selection changes: at once on first render, then with a slide.
  const placed = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !sideways(el)) return;
    const card = el.querySelectorAll<HTMLElement>(cards)[selected];
    if (!card) return;
    const left = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
    if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior: placed.current === mount && !reduceMotion() ? 'smooth' : 'auto' });
    placed.current = mount;
  }, [ref, selected, cards, mount]);

  // When a swipe comes to rest, select the card nearest the middle.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!sideways(el)) return;
        // Nearest child to the middle; a child that is not a card (the locked one) selects nothing.
        const middle = el.scrollLeft + el.clientWidth / 2;
        let nearest: HTMLElement | null = null;
        let distance = Infinity;
        for (const c of el.children as HTMLCollectionOf<HTMLElement>) {
          const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - middle);
          if (d < distance) {
            distance = d;
            nearest = c;
          }
        }
        const index = nearest ? [...el.querySelectorAll(cards)].indexOf(nearest) : -1;
        if (index >= 0) settle.current(index);
      }, 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [ref, cards, mount]);
}
