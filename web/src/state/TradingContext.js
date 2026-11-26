import { createContext, useContext } from 'react';
export const TradingContext = createContext(null);
export const useTrading = () => useContext(TradingContext);
