import type { Exchange } from '@prisma/client';

export interface SeedStock {
  symbol: string;
  name: string;
  exchange: Exchange;
  isin?: string;
  sector?: string;
  industry?: string;
}

export const SEED_STOCKS: SeedStock[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', isin: 'INE002A01018', sector: 'Energy', industry: 'Oil & Gas' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE', isin: 'INE467B01029', sector: 'IT', industry: 'IT Services' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', isin: 'INE040A01034', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', isin: 'INE090A01021', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', isin: 'INE009A01021', sector: 'IT', industry: 'IT Services' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE', isin: 'INE397D01024', sector: 'Telecom', industry: 'Telecom Services' },
  { symbol: 'ITC', name: 'ITC Ltd', exchange: 'NSE', isin: 'INE154A01025', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', isin: 'INE062A01020', sector: 'Financials', industry: 'PSU Bank' },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', exchange: 'NSE', isin: 'INE018A01030', sector: 'Industrials', industry: 'Construction' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE', isin: 'INE030A01027', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', exchange: 'NSE', isin: 'INE237A01028', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', exchange: 'NSE', isin: 'INE238A01034', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', exchange: 'NSE', isin: 'INE296A01024', sector: 'Financials', industry: 'NBFC' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', exchange: 'NSE', isin: 'INE021A01026', sector: 'Consumer', industry: 'Paints' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE', isin: 'INE585B01010', sector: 'Auto', industry: 'Cars' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd', exchange: 'NSE', isin: 'INE044A01036', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'TITAN', name: 'Titan Company Ltd', exchange: 'NSE', isin: 'INE280A01028', sector: 'Consumer', industry: 'Jewellery' },
  { symbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE', isin: 'INE075A01022', sector: 'IT', industry: 'IT Services' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', exchange: 'NSE', isin: 'INE481G01011', sector: 'Materials', industry: 'Cement' },
  { symbol: 'HCLTECH', name: 'HCL Technologies Ltd', exchange: 'NSE', isin: 'INE860A01027', sector: 'IT', industry: 'IT Services' },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd', exchange: 'NSE', isin: 'INE239A01024', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation of India Ltd', exchange: 'NSE', isin: 'INE752E01010', sector: 'Utilities', industry: 'Power' },
  { symbol: 'NTPC', name: 'NTPC Ltd', exchange: 'NSE', isin: 'INE733E01010', sector: 'Utilities', industry: 'Power' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra Ltd', exchange: 'NSE', isin: 'INE101A01026', sector: 'Auto', industry: 'Cars' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', exchange: 'NSE', isin: 'INE155A01022', sector: 'Auto', industry: 'Cars' },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', exchange: 'NSE', isin: 'INE081A01020', sector: 'Materials', industry: 'Steel' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel Ltd', exchange: 'NSE', isin: 'INE019A01038', sector: 'Materials', industry: 'Steel' },
  { symbol: 'COALINDIA', name: 'Coal India Ltd', exchange: 'NSE', isin: 'INE522F01014', sector: 'Energy', industry: 'Mining' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corporation Ltd', exchange: 'NSE', isin: 'INE213A01029', sector: 'Energy', industry: 'Oil & Gas' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd', exchange: 'NSE', isin: 'INE423A01024', sector: 'Industrials', industry: 'Conglomerate' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ Ltd', exchange: 'NSE', isin: 'INE742F01042', sector: 'Industrials', industry: 'Ports' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv Ltd', exchange: 'NSE', isin: 'INE918I01026', sector: 'Financials', industry: 'NBFC' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance Company Ltd', exchange: 'NSE', isin: 'INE795G01014', sector: 'Financials', industry: 'Insurance' },
  { symbol: 'SBILIFE', name: 'SBI Life Insurance Company Ltd', exchange: 'NSE', isin: 'INE123W01016', sector: 'Financials', industry: 'Insurance' },
  { symbol: 'BRITANNIA', name: 'Britannia Industries Ltd', exchange: 'NSE', isin: 'INE216A01030', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'DIVISLAB', name: 'Divi\'s Laboratories Ltd', exchange: 'NSE', isin: 'INE361B01024', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'DRREDDY', name: 'Dr. Reddy\'s Laboratories Ltd', exchange: 'NSE', isin: 'INE089A01023', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'CIPLA', name: 'Cipla Ltd', exchange: 'NSE', isin: 'INE059A01026', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals Enterprise Ltd', exchange: 'NSE', isin: 'INE437A01024', sector: 'Healthcare', industry: 'Hospitals' },
  { symbol: 'TECHM', name: 'Tech Mahindra Ltd', exchange: 'NSE', isin: 'INE669C01036', sector: 'IT', industry: 'IT Services' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors Ltd', exchange: 'NSE', isin: 'INE066A01021', sector: 'Auto', industry: 'Two Wheelers' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto Ltd', exchange: 'NSE', isin: 'INE917I01010', sector: 'Auto', industry: 'Two Wheelers' },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp Ltd', exchange: 'NSE', isin: 'INE158A01026', sector: 'Auto', industry: 'Two Wheelers' },
  { symbol: 'GRASIM', name: 'Grasim Industries Ltd', exchange: 'NSE', isin: 'INE047A01021', sector: 'Materials', industry: 'Cement' },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank Ltd', exchange: 'NSE', isin: 'INE095A01012', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries Ltd', exchange: 'NSE', isin: 'INE038A01020', sector: 'Materials', industry: 'Metals' },
  { symbol: 'SHREECEM', name: 'Shree Cement Ltd', exchange: 'NSE', isin: 'INE070A01015', sector: 'Materials', industry: 'Cement' },
  { symbol: 'DMART', name: 'Avenue Supermarts Ltd', exchange: 'NSE', isin: 'INE192R01011', sector: 'Consumer', industry: 'Retail' },
  { symbol: 'PIDILITIND', name: 'Pidilite Industries Ltd', exchange: 'NSE', isin: 'INE318A01026', sector: 'Materials', industry: 'Chemicals' },
  { symbol: 'BPCL', name: 'Bharat Petroleum Corporation Ltd', exchange: 'NSE', isin: 'INE029A01011', sector: 'Energy', industry: 'Oil & Gas' },
  { symbol: 'IOC', name: 'Indian Oil Corporation Ltd', exchange: 'NSE', isin: 'INE242A01010', sector: 'Energy', industry: 'Oil & Gas' },
  { symbol: 'GAIL', name: 'GAIL (India) Ltd', exchange: 'NSE', isin: 'INE129A01019', sector: 'Energy', industry: 'Gas' },
  { symbol: 'VEDL', name: 'Vedanta Ltd', exchange: 'NSE', isin: 'INE205A01025', sector: 'Materials', industry: 'Metals' },
  { symbol: 'DLF', name: 'DLF Ltd', exchange: 'NSE', isin: 'INE271C01023', sector: 'Real Estate', industry: 'Developers' },
  { symbol: 'HAVELLS', name: 'Havells India Ltd', exchange: 'NSE', isin: 'INE176B01034', sector: 'Consumer', industry: 'Electricals' },
  { symbol: 'DABUR', name: 'Dabur India Ltd', exchange: 'NSE', isin: 'INE016A01026', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'GODREJCP', name: 'Godrej Consumer Products Ltd', exchange: 'NSE', isin: 'INE102D01028', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'MARICO', name: 'Marico Ltd', exchange: 'NSE', isin: 'INE196A01026', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'COLPAL', name: 'Colgate Palmolive (India) Ltd', exchange: 'NSE', isin: 'INE259A01022', sector: 'Consumer', industry: 'FMCG' },
  { symbol: 'AMBUJACEM', name: 'Ambuja Cements Ltd', exchange: 'NSE', isin: 'INE079A01024', sector: 'Materials', industry: 'Cement' },
  { symbol: 'ACC', name: 'ACC Ltd', exchange: 'NSE', isin: 'INE012A01025', sector: 'Materials', industry: 'Cement' },
  { symbol: 'SIEMENS', name: 'Siemens Ltd', exchange: 'NSE', isin: 'INE003A01024', sector: 'Industrials', industry: 'Capital Goods' },
  { symbol: 'ABB', name: 'ABB India Ltd', exchange: 'NSE', isin: 'INE117A01022', sector: 'Industrials', industry: 'Capital Goods' },
  { symbol: 'BEL', name: 'Bharat Electronics Ltd', exchange: 'NSE', isin: 'INE263A01024', sector: 'Industrials', industry: 'Defence' },
  { symbol: 'HAL', name: 'Hindustan Aeronautics Ltd', exchange: 'NSE', isin: 'INE066F01020', sector: 'Industrials', industry: 'Defence' },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda', exchange: 'NSE', isin: 'INE028A01039', sector: 'Financials', industry: 'PSU Bank' },
  { symbol: 'PNB', name: 'Punjab National Bank', exchange: 'NSE', isin: 'INE160A01022', sector: 'Financials', industry: 'PSU Bank' },
  { symbol: 'CANBK', name: 'Canara Bank', exchange: 'NSE', isin: 'INE476A01022', sector: 'Financials', industry: 'PSU Bank' },
  { symbol: 'UNIONBANK', name: 'Union Bank of India', exchange: 'NSE', isin: 'INE692A01016', sector: 'Financials', industry: 'PSU Bank' },
  { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank Ltd', exchange: 'NSE', isin: 'INE092T01019', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'FEDERALBNK', name: 'Federal Bank Ltd', exchange: 'NSE', isin: 'INE171A01029', sector: 'Financials', industry: 'Private Bank' },
  { symbol: 'LICI', name: 'Life Insurance Corporation of India', exchange: 'NSE', isin: 'INE0J1Y01017', sector: 'Financials', industry: 'Insurance' },
  { symbol: 'ICICIPRULI', name: 'ICICI Prudential Life Insurance Company Ltd', exchange: 'NSE', isin: 'INE726G01019', sector: 'Financials', industry: 'Insurance' },
  { symbol: 'ICICIGI', name: 'ICICI Lombard General Insurance Company Ltd', exchange: 'NSE', isin: 'INE765G01017', sector: 'Financials', industry: 'Insurance' },
  { symbol: 'LTIM', name: 'LTIMindtree Ltd', exchange: 'NSE', isin: 'INE214T01019', sector: 'IT', industry: 'IT Services' },
  { symbol: 'MPHASIS', name: 'Mphasis Ltd', exchange: 'NSE', isin: 'INE356A01018', sector: 'IT', industry: 'IT Services' },
  { symbol: 'PERSISTENT', name: 'Persistent Systems Ltd', exchange: 'NSE', isin: 'INE262H01013', sector: 'IT', industry: 'IT Services' },
  { symbol: 'COFORGE', name: 'Coforge Ltd', exchange: 'NSE', isin: 'INE591G01017', sector: 'IT', industry: 'IT Services' },
  { symbol: 'ZOMATO', name: 'Zomato Ltd', exchange: 'NSE', isin: 'INE758T01015', sector: 'Consumer', industry: 'Internet' },
  { symbol: 'PAYTM', name: 'One 97 Communications Ltd', exchange: 'NSE', isin: 'INE982J01020', sector: 'Financials', industry: 'Fintech' },
  { symbol: 'NYKAA', name: 'FSN E-Commerce Ventures Ltd', exchange: 'NSE', isin: 'INE388Y01029', sector: 'Consumer', industry: 'Internet' },
  { symbol: 'POLICYBZR', name: 'PB Fintech Ltd', exchange: 'NSE', isin: 'INE417T01026', sector: 'Financials', industry: 'Fintech' },
  { symbol: 'IRCTC', name: 'Indian Railway Catering & Tourism Corp Ltd', exchange: 'NSE', isin: 'INE335Y01020', sector: 'Services', industry: 'Travel' },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation Ltd', exchange: 'NSE', isin: 'INE646L01027', sector: 'Services', industry: 'Aviation' },
  { symbol: 'TRENT', name: 'Trent Ltd', exchange: 'NSE', isin: 'INE849A01020', sector: 'Consumer', industry: 'Retail' },
  { symbol: 'LODHA', name: 'Macrotech Developers Ltd', exchange: 'NSE', isin: 'INE670K01029', sector: 'Real Estate', industry: 'Developers' },
  { symbol: 'GODREJPROP', name: 'Godrej Properties Ltd', exchange: 'NSE', isin: 'INE484J01027', sector: 'Real Estate', industry: 'Developers' },
  { symbol: 'OBEROIRLTY', name: 'Oberoi Realty Ltd', exchange: 'NSE', isin: 'INE093I01010', sector: 'Real Estate', industry: 'Developers' },
  { symbol: 'NAUKRI', name: 'Info Edge (India) Ltd', exchange: 'NSE', isin: 'INE663F01024', sector: 'Consumer', industry: 'Internet' },
  { symbol: 'PAGEIND', name: 'Page Industries Ltd', exchange: 'NSE', isin: 'INE761H01022', sector: 'Consumer', industry: 'Apparel' },
  { symbol: 'BERGEPAINT', name: 'Berger Paints India Ltd', exchange: 'NSE', isin: 'INE463A01038', sector: 'Consumer', industry: 'Paints' },
  { symbol: 'PIIND', name: 'PI Industries Ltd', exchange: 'NSE', isin: 'INE603J01030', sector: 'Materials', industry: 'Agrochemicals' },
  { symbol: 'UPL', name: 'UPL Ltd', exchange: 'NSE', isin: 'INE628A01036', sector: 'Materials', industry: 'Agrochemicals' },
  { symbol: 'BOSCHLTD', name: 'Bosch Ltd', exchange: 'NSE', isin: 'INE323A01026', sector: 'Auto', industry: 'Auto Components' },
  { symbol: 'MOTHERSON', name: 'Samvardhana Motherson International Ltd', exchange: 'NSE', isin: 'INE775A01035', sector: 'Auto', industry: 'Auto Components' },
  { symbol: 'TVSMOTOR', name: 'TVS Motor Company Ltd', exchange: 'NSE', isin: 'INE494B01023', sector: 'Auto', industry: 'Two Wheelers' },
  { symbol: 'ASHOKLEY', name: 'Ashok Leyland Ltd', exchange: 'NSE', isin: 'INE208A01029', sector: 'Auto', industry: 'Commercial Vehicles' },
  { symbol: 'LUPIN', name: 'Lupin Ltd', exchange: 'NSE', isin: 'INE326A01037', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals Ltd', exchange: 'NSE', isin: 'INE685A01028', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma Ltd', exchange: 'NSE', isin: 'INE406A01037', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'BIOCON', name: 'Biocon Ltd', exchange: 'NSE', isin: 'INE376G01013', sector: 'Pharma', industry: 'Biotech' },
  { symbol: 'ALKEM', name: 'Alkem Laboratories Ltd', exchange: 'NSE', isin: 'INE540L01014', sector: 'Pharma', industry: 'Pharma' },
  { symbol: 'JUBLFOOD', name: 'Jubilant Foodworks Ltd', exchange: 'NSE', isin: 'INE797F01020', sector: 'Consumer', industry: 'QSR' },
  { symbol: 'VBL', name: 'Varun Beverages Ltd', exchange: 'NSE', isin: 'INE200M01039', sector: 'Consumer', industry: 'Beverages' },
  { symbol: 'UBL', name: 'United Breweries Ltd', exchange: 'NSE', isin: 'INE686F01025', sector: 'Consumer', industry: 'Beverages' },
  { symbol: 'MCDOWELL-N', name: 'United Spirits Ltd', exchange: 'NSE', isin: 'INE854D01024', sector: 'Consumer', industry: 'Spirits' },
];

export async function seedStocks(prisma: any): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const stock of SEED_STOCKS) {
    const existing = await prisma.stockMaster.findUnique({ where: { symbol: stock.symbol } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.stockMaster.create({ data: stock });
    created++;
  }
  return { created, skipped };
}
