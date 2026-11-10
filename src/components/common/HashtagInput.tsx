import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { cn } from '../../lib/utils';
import { DEFAULT_TAG_SUGGESTIONS, getTagIcon } from '../../lib/tagUtils';
import { getCaretCoordinates } from '../../lib/caretUtils';
import { Plus } from 'lucide-react';

type BaseAttributes = Omit<
  React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'onKeyDown' | 'onKeyUp' | 'onBlur'
>;

export interface HashtagInputProps extends BaseAttributes {
  value: string;
  onChange: (value: string) => void;
  availableTags?: string[];
  containerClassName?: string;
  inputClassName?: string;
  multiline?: boolean;
  rows?: number;
  onEnterPress?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyUp?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const HashtagInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, HashtagInputProps>(
  (
    {
      value,
      onChange,
      availableTags = [],
      containerClassName,
      inputClassName,
      className,
      multiline = false,
      rows = 1,
      onEnterPress,
      onKeyDown,
      onKeyUp,
      onBlur,
      ...props
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const elementRef = multiline ? textareaRef : inputRef;

    useImperativeHandle(forwardedRef, () => elementRef.current as any);

    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hashStartIndex, setHashStartIndex] = useState<number>(-1);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [caretPos, setCaretPos] = useState<{ left: number; top: number } | null>(null);

    // Auto-recalculate dropdown position relative to the '#' character
    const updateDropdownPosition = () => {
      if (!isOpen || hashStartIndex < 0 || !elementRef.current || !containerRef.current) {
        return;
      }

      const coords = getCaretCoordinates(elementRef.current, hashStartIndex);
      if (!coords) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const elRect = elementRef.current.getBoundingClientRect();

      // Relative offset of input/textarea within the container
      const elOffsetLeft = elRect.left - containerRect.left;
      const elOffsetTop = elRect.top - containerRect.top;

      let left = elOffsetLeft + coords.left;
      let top = elOffsetTop + coords.top + coords.height + 6;

      // Clamp right edge so dropdown doesn't overflow container width
      const dropdownWidth = 240;
      const containerWidth = containerRef.current.clientWidth;
      const maxLeft = Math.max(0, containerWidth - dropdownWidth - 8);
      if (left > maxLeft) {
        left = maxLeft;
      }
      if (left < 0) {
        left = 0;
      }

      setCaretPos({ left, top });
    };

    useEffect(() => {
      if (!isOpen || hashStartIndex < 0) {
        setCaretPos(null);
        return;
      }

      updateDropdownPosition();
      const frame = requestAnimationFrame(updateDropdownPosition);
      const handleResize = () => updateDropdownPosition();
      window.addEventListener('resize', handleResize);

      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', handleResize);
      };
    }, [isOpen, hashStartIndex, value, query]);

    // Auto-resize textarea height to fit content if multiline
    const adjustTextareaHeight = () => {
      if (multiline && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };

    useEffect(() => {
      adjustTextareaHeight();
    }, [value, multiline]);

    useEffect(() => {
      if (!multiline) return;
      const handleResize = () => adjustTextareaHeight();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [multiline]);

    // Merge default suggestions with user's available tags
    const allTags = useMemo(() => {
      const set = new Set<string>();
      // Available tags first
      availableTags.forEach((t: string) => {
        const clean = t.replace(/^#/, '').trim().toLowerCase();
        if (clean) set.add(clean);
      });
      // Default suggestions
      DEFAULT_TAG_SUGGESTIONS.forEach((t) => set.add(t));
      return Array.from(set);
    }, [availableTags]);

    // Filter tags matching current query
    const filteredTags = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return allTags;
      return allTags.filter((t) => t.toLowerCase().includes(q));
    }, [allTags, query]);

    // Check if query is a completely new tag (not in list)
    const isNewTag = useMemo(() => {
      const q = query.trim().toLowerCase();
      return q.length > 0 && !allTags.some((t) => t.toLowerCase() === q);
    }, [allTags, query]);

    // Total options in dropdown (filtered tags + "crear nuevo" if applicable)
    const options = useMemo(() => {
      const list = [...filteredTags];
      if (isNewTag) {
        list.push(query.trim().toLowerCase());
      }
      return list;
    }, [filteredTags, isNewTag, query]);

    // Auto-scroll dropdown list to keep selected item visible when navigating with keys
    useEffect(() => {
      if (isOpen && itemRefs.current[selectedIndex]) {
        itemRefs.current[selectedIndex]?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
        });
      }
    }, [selectedIndex, isOpen]);

    // Check for active hashtag before cursor
    const checkHashtagTrigger = (val: string, cursorPos: number) => {
      const beforeCursor = val.slice(0, cursorPos);
      // Regex matches #word at the end of string right before cursor
      const match = /(?:^|\s)#([\p{L}0-9_-]*)$/u.exec(beforeCursor);

      if (match) {
        const hashIdx = beforeCursor.lastIndexOf('#');
        setQuery(match[1]);
        setHashStartIndex(hashIdx);
        setIsOpen(true);
        setSelectedIndex(0);
      } else {
        setIsOpen(false);
        setHashStartIndex(-1);
      }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextVal = e.target.value;
      const cursor = e.target.selectionStart || nextVal.length;
      onChange(nextVal);
      checkHashtagTrigger(nextVal, cursor);
    };

    const handleInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Don't re-trigger on arrow navigation handled in keydown
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        return;
      }
      const cursor = elementRef.current?.selectionStart || value.length;
      checkHashtagTrigger(value, cursor);
      onKeyUp?.(e);
    };

    const selectTag = (tagToInsert: string) => {
      if (hashStartIndex === -1 || !elementRef.current) return;
      const cleanTag = tagToInsert.replace(/^#/, '').trim();
      const beforeHash = value.slice(0, hashStartIndex);
      const afterCursor = value.slice(elementRef.current.selectionStart || hashStartIndex);

      // Clean insertion with space after tag
      const inserted = `#${cleanTag} `;
      const nextVal = beforeHash + inserted + afterCursor.replace(/^[\p{L}0-9_-]*/u, '');

      onChange(nextVal);
      setIsOpen(false);
      setHashStartIndex(-1);

      // Restore focus and cursor position right after the hashtag
      requestAnimationFrame(() => {
        if (elementRef.current) {
          elementRef.current.focus();
          const newPos = beforeHash.length + inserted.length;
          elementRef.current.setSelectionRange(newPos, newPos);
        }
      });
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (isOpen && options.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % options.length);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
          return;
        }

        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const target = options[selectedIndex] || options[0];
          if (target) {
            selectTag(target);
          }
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
          return;
        }
      }

      // Enter when autocomplete is closed
      if (e.key === 'Enter' && !e.shiftKey) {
        if (onEnterPress) {
          e.preventDefault();
          onEnterPress();
          return;
        }
      }

      onKeyDown?.(e);
    };

    // Close popover when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node) &&
          elementRef.current &&
          !elementRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const commonProps = {
      value,
      onChange: handleTextChange,
      onKeyUp: handleInputKeyUp,
      onKeyDown: handleInputKeyDown,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        // Keep open slightly so mousedown on dropdown works
        setTimeout(() => {
          if (document.activeElement !== elementRef.current) {
            setIsOpen(false);
          }
        }, 180);
        onBlur?.(e);
      },
      className: cn(className, inputClassName),
      ...props,
    };

    return (
      <div ref={containerRef} className={cn('relative w-full', containerClassName)}>
        {multiline ? (
          <textarea
            ref={textareaRef}
            rows={rows}
            {...commonProps}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            {...commonProps}
          />
        )}

        {/* Dropdown Suggestions */}
        {isOpen && options.length > 0 && (
          <div
            ref={dropdownRef}
            style={{
              left: caretPos ? `${caretPos.left}px` : undefined,
              top: caretPos ? `${caretPos.top}px` : undefined,
            }}
            className={cn(
              'absolute z-50 min-w-[210px] max-w-[280px] bg-veyra-elevated border border-veyra-border rounded-xl shadow-2xl p-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 max-h-56 overflow-y-auto',
              !caretPos && 'left-0 top-full mt-1'
            )}
          >
            <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-veyra-subtle uppercase flex items-center justify-between">
              <span>Etiquetas sugeridas</span>
              {query && <span className="text-accent font-mono">#{query}</span>}
            </div>

            <div className="space-y-0.5 mt-0.5">
              {options.map((opt, idx) => {
                const isSelected = idx === selectedIndex;
                const isCustom = isNewTag && idx === options.length - 1;
                const IconComp = getTagIcon(opt);

                return (
                  <button
                    key={`${opt}-${idx}`}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur
                      selectTag(opt);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left select-none',
                      isSelected
                        ? 'bg-accent/15 text-accent font-medium'
                        : 'text-veyra-text hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isCustom ? (
                        <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
                      ) : (
                        <IconComp className={cn('w-3.5 h-3.5 shrink-0', isSelected ? 'text-accent' : 'text-veyra-subtle')} />
                      )}
                      <span className="truncate">
                        #{opt}
                      </span>
                    </div>

                    {isCustom ? (
                      <span className="text-[10px] text-accent/80 font-medium px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20 shrink-0">
                        Nuevo
                      </span>
                    ) : (
                      <span className="text-[10px] text-veyra-subtle font-mono shrink-0">
                        Tag
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-1 pt-1 border-t border-veyra-border/60 px-2 py-0.5 text-[10px] text-veyra-subtle flex items-center justify-between">
              <span>↑↓ Navegar • Enter Seleccionar</span>
              <span>Esc Cerrar</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

HashtagInput.displayName = 'HashtagInput';

