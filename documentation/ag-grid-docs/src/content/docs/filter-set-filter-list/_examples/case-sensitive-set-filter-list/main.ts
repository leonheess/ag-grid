import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import {
    FirstDataRenderedEvent,
    GridApi,
    GridOptions,
    ICellRendererParams,
    ISetFilterParams,
    createGrid,
} from '@ag-grid-community/core';
import { CommunityFeaturesModule, ModuleRegistry } from '@ag-grid-community/core';
import { ColumnsToolPanelModule } from '@ag-grid-enterprise/column-tool-panel';
import { FiltersToolPanelModule } from '@ag-grid-enterprise/filter-tool-panel';
import { MenuModule } from '@ag-grid-enterprise/menu';
import { SetFilterModule } from '@ag-grid-enterprise/set-filter';

import { getData } from './data';

ModuleRegistry.registerModules([
    CommunityFeaturesModule,
    ClientSideRowModelModule,
    ColumnsToolPanelModule,
    FiltersToolPanelModule,
    MenuModule,
    SetFilterModule,
]);

let gridApi: GridApi;

const gridOptions: GridOptions = {
    columnDefs: [
        {
            headerName: 'Case Insensitive (default)',
            field: 'colour',
            filter: 'agSetColumnFilter',
            filterParams: {
                caseSensitive: false,
                cellRenderer: colourCellRenderer,
            } as ISetFilterParams,
        },
        {
            headerName: 'Case Sensitive',
            field: 'colour',
            filter: 'agSetColumnFilter',
            filterParams: {
                caseSensitive: true,
                cellRenderer: colourCellRenderer,
            } as ISetFilterParams,
        },
    ],
    defaultColDef: {
        flex: 1,
        minWidth: 225,
        cellRenderer: colourCellRenderer,
        floatingFilter: true,
    },
    sideBar: 'filters',
    onFirstDataRendered: onFirstDataRendered,
    rowData: getData(),
};

const FIXED_STYLES =
    'vertical-align: middle; border: 1px solid black; margin: 3px; display: inline-block; width: 10px; height: 10px';

function colourCellRenderer(params: ICellRendererParams) {
    if (!params.value || params.value === '(Select All)') {
        return params.value;
    }

    return `<div style="background-color: ${params.value.toLowerCase()}; ${FIXED_STYLES}"></div>${params.value}`;
}

function onFirstDataRendered(params: FirstDataRenderedEvent) {
    params.api.getToolPanelInstance('filters')!.expandFilters();
}

// setup the grid after the page has finished loading
document.addEventListener('DOMContentLoaded', function () {
    const gridDiv = document.querySelector<HTMLElement>('#myGrid')!;
    gridApi = createGrid(gridDiv, gridOptions);
});
