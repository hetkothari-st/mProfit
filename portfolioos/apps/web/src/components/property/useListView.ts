import { useState } from 'react';

export type ListView = 'grid' | 'map';

const storageKey = (page: string) => `portfolioos.listView.${page}`;

function readView(page: string): ListView {
  try {
    return localStorage.getItem(storageKey(page)) === 'map' ? 'map' : 'grid';
  } catch {
    return 'grid'; // storage blocked — start on the grid
  }
}

/** False when storage is blocked: the view still changes, it just isn't remembered. */
function saveView(page: string, view: ListView): boolean {
  try {
    localStorage.setItem(storageKey(page), view);
    return true;
  } catch {
    return false;
  }
}

/** Grid or map, remembered per page for this viewer. */
export function useListView(page: string): [ListView, (v: ListView) => void] {
  const [view, setView] = useState<ListView>(() => readView(page));
  return [
    view,
    (v) => {
      setView(v);
      saveView(page, v);
    },
  ];
}
