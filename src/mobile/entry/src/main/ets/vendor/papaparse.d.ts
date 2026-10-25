export interface CsvOptions { skipEmptyLines: string; }
export interface CsvError { message: string; }
export interface CsvResult { data: string[][]; errors: CsvError[]; }
declare const Papa: { parse(text: string, options: CsvOptions): CsvResult };
export default Papa;
