// Type definitions for @ag-grid-community/core v27.2.1
// Project: http://www.ag-grid.com/
// Definitions by: Niall Crosby <https://github.com/ag-grid/>
import { AgGridCommon } from "../../interfaces/iCommon";
import { IComponent } from "../../interfaces/iComponent";
import { Component } from "../../widgets/component";
export interface INoRowsOverlayParams extends AgGridCommon {
}
export interface INoRowsOverlayComp extends IComponent<INoRowsOverlayParams> {
}
export declare class NoRowsOverlayComponent extends Component implements INoRowsOverlayComp {
    private static DEFAULT_NO_ROWS_TEMPLATE;
    constructor();
    destroy(): void;
    init(params: INoRowsOverlayParams): void;
}
