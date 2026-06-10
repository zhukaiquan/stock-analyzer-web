'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

interface Stock {
  symbol: string;
  name: string;
  market: string;
  industry?: string;
}

interface StockSearchProps {
  onSelect: (stock: Stock) => void;
  placeholder?: string;
}

export default function StockSearch({ onSelect, placeholder = '输入股票代码或名称...' }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stock[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const latestQueryRef = useRef('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    latestQueryRef.current = query;

    if (query.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const currentQuery = query;

    const searchStocks = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(currentQuery)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (latestQueryRef.current === currentQuery) {
          setResults(data);
          setIsOpen(true);
        }
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
        if (latestQueryRef.current === currentQuery) {
          setResults([]);
        }
      } finally {
        if (latestQueryRef.current === currentQuery) {
          setLoading(false);
        }
      }
    };

    const debounce = setTimeout(searchStocks, 300);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (stock: Stock) => {
    setQuery(stock.name);
    setIsOpen(false);
    onSelect(stock);
  };

  const getMarketBadge = (market: string) => {
    const colors: Record<string, string> = {
      'A': 'bg-red-100 text-red-800',
      'HK': 'bg-blue-100 text-blue-800',
      'US': 'bg-green-100 text-green-800'
    };

    return (
      <Badge variant="secondary" className={colors[market] || 'bg-gray-100 text-gray-800'}>
        {market}
      </Badge>
    );
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="pl-10"
        />
      </div>

      {isOpen && results.length > 0 && (
        <Card className="absolute z-50 w-full mt-1 shadow-lg">
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-100 max-h-80 overflow-auto">
              {results.map((stock) => (
                <li
                  key={`${stock.market}-${stock.symbol}`}
                  className="p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                  onClick={() => handleSelect(stock)}
                >
                  <div>
                    <div className="font-medium">{stock.name}</div>
                    <div className="text-sm text-gray-500">{stock.symbol}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stock.industry && (
                      <span className="text-xs text-gray-400">{stock.industry}</span>
                    )}
                    {getMarketBadge(stock.market)}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
        </div>
      )}
    </div>
  );
}
