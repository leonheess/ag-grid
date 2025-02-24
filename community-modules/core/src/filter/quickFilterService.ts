import type { ColumnModel } from '../columns/columnModel';
import type { PivotResultColsService } from '../columns/pivotResultColsService';
import type { NamedBean } from '../context/bean';
import { BeanStub } from '../context/beanStub';
import type { BeanCollection } from '../context/context';
import type { AgColumn } from '../entities/agColumn';
import type { GetQuickFilterTextParams } from '../entities/colDef';
import type { RowNode } from '../entities/rowNode';
import type { IRowModel } from '../interfaces/iRowModel';
import { _warnOnce } from '../utils/function';
import { _exists } from '../utils/generic';
import type { ValueService } from '../valueService/valueService';

export type QuickFilterServiceEvent = 'quickFilterChanged';
export class QuickFilterService extends BeanStub<QuickFilterServiceEvent> implements NamedBean {
    beanName = 'quickFilterService' as const;

    private valueService: ValueService;
    private columnModel: ColumnModel;
    private rowModel: IRowModel;
    private pivotResultColsService: PivotResultColsService;

    public wireBeans(beans: BeanCollection): void {
        this.valueService = beans.valueService;
        this.columnModel = beans.columnModel;
        this.rowModel = beans.rowModel;
        this.pivotResultColsService = beans.pivotResultColsService;
    }

    // the columns the quick filter should use. this will be all primary columns plus the autoGroupColumns if any exist
    private colsForQuickFilter: AgColumn[];

    private quickFilter: string | null = null;
    private quickFilterParts: string[] | null = null;
    private parser?: (quickFilter: string) => string[];
    private matcher?: (quickFilterParts: string[], rowQuickFilterAggregateText: string) => boolean;

    public postConstruct(): void {
        const resetListener = this.resetQuickFilterCache.bind(this);
        this.addManagedEventListeners({
            columnPivotModeChanged: resetListener,
            newColumnsLoaded: resetListener,
            columnRowGroupChanged: resetListener,
            columnVisible: () => {
                if (!this.gos.get('includeHiddenColumnsInQuickFilter')) {
                    this.resetQuickFilterCache();
                }
            },
        });

        this.addManagedPropertyListener('quickFilterText', (e) => this.setQuickFilter(e.currentValue));
        this.addManagedPropertyListeners(
            ['includeHiddenColumnsInQuickFilter', 'applyQuickFilterBeforePivotOrAgg'],
            () => this.onQuickFilterColumnConfigChanged()
        );

        this.quickFilter = this.parseQuickFilter(this.gos.get('quickFilterText'));
        this.parser = this.gos.get('quickFilterParser');
        this.matcher = this.gos.get('quickFilterMatcher');
        this.setQuickFilterParts();

        this.addManagedPropertyListeners(['quickFilterMatcher', 'quickFilterParser'], () =>
            this.setQuickFilterParserAndMatcher()
        );
    }

    // if we are using autoGroupCols, then they should be included for quick filter. this covers the
    // following scenarios:
    // a) user provides 'field' into autoGroupCol of normal grid, so now because a valid col to filter leafs on
    // b) using tree data and user depends on autoGroupCol for first col, and we also want to filter on this
    //    (tree data is a bit different, as parent rows can be filtered on, unlike row grouping)
    public refreshQuickFilterCols(): void {
        const pivotMode = this.columnModel.isPivotMode();
        const groupAutoCols = this.columnModel.getAutoCols();
        const providedCols = this.columnModel.getColDefCols();

        let columnsForQuickFilter =
            (pivotMode && !this.gos.get('applyQuickFilterBeforePivotOrAgg')
                ? this.pivotResultColsService.getPivotResultCols()?.list
                : providedCols) ?? [];
        if (groupAutoCols) {
            columnsForQuickFilter = columnsForQuickFilter.concat(groupAutoCols);
        }
        this.colsForQuickFilter = this.gos.get('includeHiddenColumnsInQuickFilter')
            ? columnsForQuickFilter
            : columnsForQuickFilter.filter((col) => col.isVisible() || col.isRowGroupActive());
    }

    public isQuickFilterPresent(): boolean {
        return this.quickFilter !== null;
    }

    public doesRowPassQuickFilter(node: RowNode): boolean {
        const usingCache = this.gos.get('cacheQuickFilter');

        if (this.matcher) {
            return this.doesRowPassQuickFilterMatcher(usingCache, node);
        }

        // each part must pass, if any fails, then the whole filter fails
        return this.quickFilterParts!.every((part) =>
            usingCache ? this.doesRowPassQuickFilterCache(node, part) : this.doesRowPassQuickFilterNoCache(node, part)
        );
    }

    public resetQuickFilterCache(): void {
        this.rowModel.forEachNode((node) => (node.quickFilterAggregateText = null));
    }

    private setQuickFilterParts(): void {
        const { quickFilter, parser } = this;
        if (quickFilter) {
            this.quickFilterParts = parser ? parser(quickFilter) : quickFilter.split(' ');
        } else {
            this.quickFilterParts = null;
        }
    }

    private parseQuickFilter(newFilter?: string): string | null {
        if (!_exists(newFilter)) {
            return null;
        }

        if (!this.gos.isRowModelType('clientSide')) {
            _warnOnce('Quick filtering only works with the Client-Side Row Model');
            return null;
        }

        return newFilter.toUpperCase();
    }

    private setQuickFilter(newFilter: string | undefined): void {
        if (newFilter != null && typeof newFilter !== 'string') {
            _warnOnce(`Grid option quickFilterText only supports string inputs, received: ${typeof newFilter}`);
            return;
        }

        const parsedFilter = this.parseQuickFilter(newFilter);

        if (this.quickFilter !== parsedFilter) {
            this.quickFilter = parsedFilter;
            this.setQuickFilterParts();
            this.dispatchLocalEvent({ type: 'quickFilterChanged' });
        }
    }

    private setQuickFilterParserAndMatcher(): void {
        const parser = this.gos.get('quickFilterParser');
        const matcher = this.gos.get('quickFilterMatcher');
        const hasChanged = parser !== this.parser || matcher !== this.matcher;
        this.parser = parser;
        this.matcher = matcher;
        if (hasChanged) {
            this.setQuickFilterParts();
            this.dispatchLocalEvent({ type: 'quickFilterChanged' });
        }
    }

    private onQuickFilterColumnConfigChanged(): void {
        this.refreshQuickFilterCols();
        this.resetQuickFilterCache();
        if (this.isQuickFilterPresent()) {
            this.dispatchLocalEvent({ type: 'quickFilterChanged' });
        }
    }

    private doesRowPassQuickFilterNoCache(node: RowNode, filterPart: string): boolean {
        return this.colsForQuickFilter.some((column) => {
            const part = this.getQuickFilterTextForColumn(column, node);

            return _exists(part) && part.indexOf(filterPart) >= 0;
        });
    }

    private doesRowPassQuickFilterCache(node: RowNode, filterPart: string): boolean {
        this.checkGenerateQuickFilterAggregateText(node);

        return node.quickFilterAggregateText!.indexOf(filterPart) >= 0;
    }

    private doesRowPassQuickFilterMatcher(usingCache: boolean, node: RowNode): boolean {
        let quickFilterAggregateText: string;
        if (usingCache) {
            this.checkGenerateQuickFilterAggregateText(node);
            quickFilterAggregateText = node.quickFilterAggregateText!;
        } else {
            quickFilterAggregateText = this.getQuickFilterAggregateText(node);
        }
        const { quickFilterParts, matcher } = this;
        return matcher!(quickFilterParts!, quickFilterAggregateText);
    }

    private checkGenerateQuickFilterAggregateText(node: RowNode): void {
        if (!node.quickFilterAggregateText) {
            node.quickFilterAggregateText = this.getQuickFilterAggregateText(node);
        }
    }

    private getQuickFilterTextForColumn(column: AgColumn, node: RowNode): string {
        let value = this.valueService.getValue(column, node, true);
        const colDef = column.getColDef();

        if (colDef.getQuickFilterText) {
            const params: GetQuickFilterTextParams = this.gos.addGridCommonParams({
                value,
                node,
                data: node.data,
                column,
                colDef,
            });

            value = colDef.getQuickFilterText(params);
        }

        if (!_exists(value)) return null;
        if (typeof value === 'object') return Object.values(value).join(' ').toUpperCase();
        if (Array.isArray(value)) return value.join(' ').toUpperCase();
        return value.toString().toUpperCase();
    }

    private getQuickFilterAggregateText(node: RowNode): string {
        const stringParts: string[] = [];

        this.colsForQuickFilter.forEach((column) => {
            const part = this.getQuickFilterTextForColumn(column, node);

            if (_exists(part)) {
                stringParts.push(part);
            }
        });

        return stringParts.join('\n');
    }
}
