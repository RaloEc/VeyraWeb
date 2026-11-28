import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface SearchResultRange {
  from: number;
  to: number;
}

export interface SearchAndReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  isPulse: boolean;
  results: SearchResultRange[];
  currentIndex: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      setCaseSensitive: (caseSensitive: boolean) => ReturnType;
      nextSearchResult: () => ReturnType;
      previousSearchResult: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
      clearSearch: () => ReturnType;
      flashSearchMatch: (term: string) => ReturnType;
    };
  }
}

const searchPluginKey = new PluginKey('veyraSearchAndReplace');

const ACCENT_FOLD_MAP: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n',
};

function foldLower1to1(str: string): string {
  const lower = str.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    out += ACCENT_FOLD_MAP[ch] ?? ch;
  }
  return out;
}

function findMatches(
  doc: ProseMirrorNode,
  searchTerm: string,
  caseSensitive: boolean
): SearchResultRange[] {
  const results: SearchResultRange[] = [];
  if (!searchTerm) return results;

  const needle = caseSensitive ? searchTerm : foldLower1to1(searchTerm);

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const haystack = caseSensitive ? node.text : foldLower1to1(node.text);
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      results.push({
        from: pos + idx,
        to: pos + idx + searchTerm.length,
      });
      idx = haystack.indexOf(needle, idx + Math.max(1, needle.length));
    }
  });

  return results;
}

export const SearchAndReplaceExtension = Extension.create<Record<string, never>, SearchAndReplaceStorage>({
  name: 'searchAndReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      caseSensitive: false,
      isPulse: false,
      results: [],
      currentIndex: 0,
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ state, dispatch }) => {
          this.storage.isPulse = false;
          this.storage.searchTerm = term;
          this.storage.results = findMatches(state.doc, term, this.storage.caseSensitive);
          this.storage.currentIndex = this.storage.results.length > 0 ? 0 : 0;
          if (dispatch) {
            dispatch(state.tr.setMeta(searchPluginKey, { updated: true }));
          }
          return true;
        },

      setReplaceTerm:
        (term: string) =>
        () => {
          this.storage.replaceTerm = term;
          return true;
        },

      setCaseSensitive:
        (caseSensitive: boolean) =>
        ({ state, dispatch }) => {
          this.storage.caseSensitive = caseSensitive;
          this.storage.results = findMatches(
            state.doc,
            this.storage.searchTerm,
            caseSensitive
          );
          this.storage.currentIndex = 0;
          if (dispatch) {
            dispatch(state.tr.setMeta(searchPluginKey, { updated: true }));
          }
          return true;
        },

      nextSearchResult:
        () =>
        ({ state, dispatch }) => {
          const total = this.storage.results.length;
          if (total === 0) return false;
          this.storage.currentIndex = (this.storage.currentIndex + 1) % total;
          if (dispatch) {
            dispatch(state.tr.setMeta(searchPluginKey, { updated: true }));
          }
          return true;
        },

      previousSearchResult:
        () =>
        ({ state, dispatch }) => {
          const total = this.storage.results.length;
          if (total === 0) return false;
          this.storage.currentIndex = (this.storage.currentIndex - 1 + total) % total;
          if (dispatch) {
            dispatch(state.tr.setMeta(searchPluginKey, { updated: true }));
          }
          return true;
        },

      replaceCurrent:
        () =>
        ({ state, dispatch }) => {
          const { results, currentIndex, replaceTerm, searchTerm, caseSensitive } = this.storage;
          if (results.length === 0) return false;
          const target = results[currentIndex];
          if (!target) return false;

          if (dispatch) {
            const tr = state.tr.insertText(replaceTerm, target.from, target.to);
            this.storage.results = findMatches(tr.doc, searchTerm, caseSensitive);
            if (this.storage.results.length === 0) {
              this.storage.currentIndex = 0;
            } else if (currentIndex >= this.storage.results.length) {
              this.storage.currentIndex = 0;
            }
            tr.setMeta(searchPluginKey, { updated: true });
            dispatch(tr);
          }
          return true;
        },

      replaceAll:
        () =>
        ({ state, dispatch }) => {
          const { results, replaceTerm } = this.storage;
          if (results.length === 0) return false;

          if (dispatch) {
            let tr = state.tr;
            for (let i = results.length - 1; i >= 0; i--) {
              const { from, to } = results[i];
              tr = tr.insertText(replaceTerm, from, to);
            }
            this.storage.results = [];
            this.storage.currentIndex = 0;
            tr.setMeta(searchPluginKey, { updated: true });
            dispatch(tr);
          }
          return true;
        },

      clearSearch:
        () =>
        ({ state, dispatch }) => {
          this.storage.isPulse = false;
          this.storage.searchTerm = '';
          this.storage.results = [];
          this.storage.currentIndex = 0;
          if (dispatch) {
            dispatch(state.tr.setMeta(searchPluginKey, { updated: true }));
          }
          return true;
        },

      flashSearchMatch:
        (term: string) =>
        ({ state, dispatch }) => {
          const clean = term.trim();
          if (!clean) return false;
          this.storage.isPulse = true;
          this.storage.searchTerm = clean;
          let matches = findMatches(state.doc, clean, false);
          if (matches.length === 0) {
            // Try individual words if full phrase didn't match
            const words = clean.split(/\s+/).filter((w) => w.length >= 2);
            for (const w of words) {
              matches = findMatches(state.doc, w, false);
              if (matches.length > 0) {
                this.storage.searchTerm = w;
                break;
              }
            }
          }
          this.storage.results = matches;
          this.storage.currentIndex = 0;
          if (dispatch) {
            dispatch(state.tr.setMeta(searchPluginKey, { updated: true }));
          }
          return matches.length > 0;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldSet, _oldState, newState) => {
            if (!storage.searchTerm) {
              storage.results = [];
              return DecorationSet.empty;
            }

            if (tr.docChanged) {
              storage.results = findMatches(
                newState.doc,
                storage.searchTerm,
                storage.caseSensitive
              );
              if (storage.currentIndex >= storage.results.length) {
                storage.currentIndex = Math.max(0, storage.results.length - 1);
              }
            } else if (!tr.getMeta(searchPluginKey)) {
              return oldSet;
            }

            if (storage.results.length === 0) {
              return DecorationSet.empty;
            }

            const decorations = storage.results.map((range, idx) =>
              Decoration.inline(range.from, range.to, {
                class: storage.isPulse
                  ? idx === 0
                    ? 'veyra-search-match-pulse'
                    : 'veyra-search-match'
                  : idx === storage.currentIndex
                    ? 'veyra-search-match veyra-search-match-active'
                    : 'veyra-search-match',
              })
            );

            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
