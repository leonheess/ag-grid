'use strict';

import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { ColDef, ColGroupDef, IFilter } from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { AgGridReact, getInstance } from '@ag-grid-community/react';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-quartz.css';
import React, { StrictMode, useCallback, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { getData } from './data.tsx';
import PartialMatchFilter from './partialMatchFilter';
import './styles.css';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const GridExample = () => {
    const gridRef = useRef<AgGridReact>(null);
    const containerStyle = useMemo(() => ({ width: '100%', height: '100%' }), []);
    const gridStyle = useMemo(() => ({ height: '100%', width: '100%' }), []);
    const [rowData, setRowData] = useState<any[]>(getData());
    const [columnDefs, setColumnDefs] = useState<(ColDef | ColGroupDef)[] | null>([
        { field: 'row' },
        {
            field: 'name',
            filter: PartialMatchFilter,
        },
    ]);
    const defaultColDef = useMemo<ColDef>(() => {
        return {
            editable: true,
            flex: 1,
            minWidth: 100,
            filter: true,
        };
    }, []);

    const onClicked = useCallback(() => {
        gridRef.current!.api.getColumnFilterInstance('name').then((instance) => {
            getInstance<IFilter, IFilter & { componentMethod(message: string): void }>(instance!, (component) => {
                if (component) {
                    component.componentMethod('Hello World!');
                }
            });
        });
    }, []);

    return (
        <div style={containerStyle}>
            <div className="example-wrapper">
                <button style={{ marginBottom: '5px' }} onClick={onClicked} className="btn btn-primary">
                    Invoke Filter Instance Method
                </button>

                <div
                    style={gridStyle}
                    className={
                        /** DARK MODE START **/ document.documentElement?.dataset.defaultTheme ||
                        'ag-theme-quartz' /** DARK MODE END **/
                    }
                >
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                    />
                </div>
            </div>
        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <StrictMode>
        <GridExample />
    </StrictMode>
);
