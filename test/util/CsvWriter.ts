import { promises as fs } from 'fs';

export type _CsvRowData<T extends readonly string[]> = { [key in T[number]]: any };

export type CsvRowData<T> = T extends readonly string[]
    ? _CsvRowData<T>
    : T extends CsvRowData<infer ColumnNames extends readonly string[]>
    ? _CsvRowData<ColumnNames>
    : never;

export class CsvWriter<ColumnNames extends readonly string[]> {
    private readonly rows: CsvRowData<ColumnNames>[] = [];
    constructor(readonly columnNames: ColumnNames) {}

    addRow(row: CsvRowData<ColumnNames>) {
        this.rows.push(row);
    }

    toString(): string {
        return [
            this.columnNames.join(','),
            ...this.rows.map((row) => this.columnNames.map((col: keyof CsvRowData<ColumnNames>) => row[col]).join(',')),
        ].join('\n');
    }

    async dumpToFile(fileName: string) {
        return fs.writeFile(fileName, this.toString());
    }
}
