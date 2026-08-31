export interface TwelveDataQuoteResponse {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  price?: string;
  change?: string;
  percent_change?: string;
  open?: string;
  high?: string;
  low?: string;
  previous_close?: string;
  volume?: string;
}

export interface TwelveDataSymbolSearchResponse {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  type?: string;
}

export interface TwelveDataSeriesPoint {
  datetime?: string;
  timestamp?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

export interface TwelveDataProfileResponse {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
}

export interface TwelveDataApiError {
  code?: string;
  message?: string;
  status?: number;
}
