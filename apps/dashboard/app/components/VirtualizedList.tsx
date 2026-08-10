"use client";

import { useRef, useCallback } from "react";
import { VariableSizeList as List, ListChildComponentProps } from "react-window";

interface VirtualizedListProps<T> {
  items: T[];
  height: number;
  width?: number;
  itemHeight?: (index: number) => number;
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  overscanCount?: number;
  className?: string;
}

export function VirtualizedList<T>({
  items,
  height,
  width = 1000,
  itemHeight,
  renderItem,
  overscanCount = 5,
  className,
}: VirtualizedListProps<T>) {
  const listRef = useRef<List>(null);

  const getItemSize = useCallback(
    (index: number) => itemHeight?.(index) ?? 50,
    [itemHeight]
  );

  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => (
      <div style={style}>
        {renderItem(items[index], index, { height: getItemSize(index) })}
      </div>
    ),
    [items, renderItem, getItemSize]
  );

  return (
    <List
      ref={listRef}
      height={height}
      width={width}
      itemCount={items.length}
      itemSize={getItemSize}
      overscanCount={overscanCount}
      className={className}
    >
      {Row}
    </List>
  );
}

export function VirtualizedTable({
  data,
  columns,
  rowHeight = 48,
  height = 400,
}: {
  data: Record<string, unknown>[];
  columns: { key: string; label: string; width?: number }[];
  rowHeight?: number;
  height?: number;
}) {
  return (
    <div className="virtualized-table" style={{ height }}>
      <div className="virtualized-table-header">
        {columns.map((col) => (
          <div key={col.key} className="virtualized-table-th" style={{ width: col.width }}>
            {col.label}
          </div>
        ))}
      </div>
      <VirtualizedList
        items={data}
        height={height - 40}
        itemHeight={() => rowHeight}
        renderItem={(item) => (
          <div className="virtualized-table-row">
            {columns.map((col) => (
              <div key={col.key} className="virtualized-table-td" style={{ width: col.width }}>
                {String(item[col.key] ?? "")}
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}