import type { UserCompDetails } from '../../../components/framework/userComponentFactory';
import { HorizontalDirection } from '../../../constants/direction';
import { KeyCode } from '../../../constants/keyCode';
import type { BeanCollection } from '../../../context/context';
import type { DragItem } from '../../../dragAndDrop/dragAndDropService';
import { DragSourceType } from '../../../dragAndDrop/dragAndDropService';
import type { AgColumn } from '../../../entities/agColumn';
import type { SortDirection } from '../../../entities/colDef';
import { SetLeftFeature } from '../../../rendering/features/setLeftFeature';
import type { ColumnSortState } from '../../../utils/aria';
import { _getAriaSortState } from '../../../utils/aria';
import { ManagedFocusFeature } from '../../../widgets/managedFocusFeature';
import type { ITooltipFeatureCtrl } from '../../../widgets/tooltipFeature';
import { TooltipFeature } from '../../../widgets/tooltipFeature';
import { attemptMoveColumns, normaliseX } from '../../columnMoveHelper';
import type { HeaderPosition } from '../../common/headerPosition';
import type { HeaderRowCtrl } from '../../row/headerRowCtrl';
import type { IAbstractHeaderCellComp } from '../abstractCell/abstractHeaderCellCtrl';
import { AbstractHeaderCellCtrl } from '../abstractCell/abstractHeaderCellCtrl';
import { _getHeaderClassesFromColDef } from '../cssClassApplier';
import { HoverFeature } from '../hoverFeature';
import type { IHeader, IHeaderParams } from './headerComp';
import { HeaderComp } from './headerComp';
import { ResizeFeature } from './resizeFeature';
import { SelectAllFeature } from './selectAllFeature';

export interface IHeaderCellComp extends IAbstractHeaderCellComp {
    setWidth(width: string): void;
    setAriaSort(sort?: ColumnSortState): void;
    setUserCompDetails(compDetails: UserCompDetails): void;
    getUserCompInstance(): IHeader | undefined;
}

type HeaderAriaDescriptionKey = 'filter' | 'menu' | 'sort' | 'selectAll' | 'filterButton';

export class HeaderCellCtrl extends AbstractHeaderCellCtrl<IHeaderCellComp, AgColumn, ResizeFeature> {
    private refreshFunctions: (() => void)[] = [];
    private selectAllFeature: SelectAllFeature;

    private sortable: boolean | null | undefined;
    private displayName: string | null;
    private draggable: boolean;
    private menuEnabled: boolean;
    private openFilterEnabled: boolean;
    private dragSourceElement: HTMLElement | undefined;

    private userCompDetails: UserCompDetails;

    private userHeaderClasses: Set<string> = new Set();
    private ariaDescriptionProperties = new Map<HeaderAriaDescriptionKey, string>();
    private tooltipFeature: TooltipFeature | undefined;

    constructor(column: AgColumn, beans: BeanCollection, parentRowCtrl: HeaderRowCtrl) {
        super(column, beans, parentRowCtrl);
        this.column = column;
    }

    public setComp(
        comp: IHeaderCellComp,
        eGui: HTMLElement,
        eResize: HTMLElement,
        eHeaderCompWrapper: HTMLElement
    ): void {
        this.comp = comp;

        this.setGui(eGui);
        this.updateState();
        this.setupWidth();
        this.setupMovingCss();
        this.setupMenuClass();
        this.setupSortableClass();
        this.setupWrapTextClass();
        this.refreshSpanHeaderHeight();

        this.setupAutoHeight({
            wrapperElement: eHeaderCompWrapper,
            checkMeasuringCallback: (checkMeasuring) => this.addRefreshFunction(checkMeasuring),
        });

        this.addColumnHoverListener();
        this.setupFilterClass();
        this.setupClassesFromColDef();
        this.setupTooltip();
        this.addActiveHeaderMouseListeners();
        this.setupSelectAll();
        this.setupUserComp();
        this.refreshAria();

        this.resizeFeature = this.createManagedBean(
            new ResizeFeature(this.getPinned(), this.column, eResize, comp, this)
        );
        this.createManagedBean(new HoverFeature([this.column], eGui));
        this.createManagedBean(new SetLeftFeature(this.column, eGui, this.beans));
        this.createManagedBean(
            new ManagedFocusFeature(eGui, {
                shouldStopEventPropagation: (e) => this.shouldStopEventPropagation(e),
                onTabKeyDown: () => null,
                handleKeyDown: this.handleKeyDown.bind(this),
                onFocusIn: this.onFocusIn.bind(this),
                onFocusOut: this.onFocusOut.bind(this),
            })
        );

        this.addResizeAndMoveKeyboardListeners(eGui);

        this.addManagedPropertyListeners(
            ['suppressMovableColumns', 'suppressMenuHide', 'suppressAggFuncInHeader'],
            this.refresh.bind(this)
        );
        this.addManagedListeners(this.column, { colDefChanged: this.refresh.bind(this) });

        this.addManagedEventListeners({
            columnValueChanged: this.onColumnValueChanged.bind(this),
            columnRowGroupChanged: this.onColumnRowGroupChanged.bind(this),
            columnPivotChanged: this.onColumnPivotChanged.bind(this),
            headerHeightChanged: this.onHeaderHeightChanged.bind(this),
        });
    }

    protected resizeHeader(delta: number, shiftKey: boolean): void {
        if (!this.column.isResizable()) {
            return;
        }

        const actualWidth = this.column.getActualWidth();
        const minWidth = this.column.getMinWidth();
        const maxWidth = this.column.getMaxWidth();

        const newWidth = Math.min(Math.max(actualWidth + delta, minWidth), maxWidth);

        this.beans.columnSizeService.setColumnWidths(
            [{ key: this.column, newWidth }],
            shiftKey,
            true,
            'uiColumnResized'
        );
    }

    protected moveHeader(hDirection: HorizontalDirection): void {
        const { eGui, column, gos, ctrlsService } = this;
        const pinned = this.getPinned();
        const left = eGui.getBoundingClientRect().left;
        const width = column.getActualWidth();
        const isRtl = gos.get('enableRtl');
        const isLeft = (hDirection === HorizontalDirection.Left) !== isRtl;

        const xPosition = normaliseX(isLeft ? left - 20 : left + width + 20, pinned, true, gos, ctrlsService);
        const headerPosition = this.focusService.getFocusedHeader();

        attemptMoveColumns({
            allMovingColumns: [column],
            isFromHeader: true,
            hDirection,
            xPosition,
            pinned,
            fromEnter: false,
            fakeEvent: false,
            gos,
            columnModel: this.beans.columnModel,
            columnMoveService: this.beans.columnMoveService,
            presentedColsService: this.beans.visibleColsService,
        });

        ctrlsService.getGridBodyCtrl().getScrollFeature().ensureColumnVisible(column, 'auto');

        if ((!this.isAlive() || this.beans.gos.get('ensureDomOrder')) && headerPosition) {
            this.restoreFocus(headerPosition);
        }
    }

    protected restoreFocus(previousPosition: HeaderPosition): void {
        this.focusService.focusHeaderPosition({
            headerPosition: {
                ...previousPosition,
                column: this.column,
            },
        });
    }

    private setupUserComp(): void {
        const compDetails = this.lookupUserCompDetails();
        this.setCompDetails(compDetails);
    }

    private setCompDetails(compDetails: UserCompDetails): void {
        this.userCompDetails = compDetails;
        this.comp.setUserCompDetails(compDetails);
    }

    private lookupUserCompDetails(): UserCompDetails {
        const params = this.createParams();
        const colDef = this.column.getColDef();
        return this.userComponentFactory.getHeaderCompDetails(colDef, params)!;
    }

    private createParams(): IHeaderParams {
        const params: IHeaderParams = this.gos.addGridCommonParams({
            column: this.column,
            displayName: this.displayName!,
            enableSorting: this.column.isSortable(),
            enableMenu: this.menuEnabled,
            enableFilterButton: this.openFilterEnabled && this.menuService.isHeaderFilterButtonEnabled(this.column),
            enableFilterIcon: !this.openFilterEnabled || this.menuService.isLegacyMenuEnabled(),
            showColumnMenu: (buttonElement: HTMLElement) => {
                this.menuService.showColumnMenu({
                    column: this.column,
                    buttonElement,
                    positionBy: 'button',
                });
            },
            showColumnMenuAfterMouseClick: (mouseEvent: MouseEvent | Touch) => {
                this.menuService.showColumnMenu({
                    column: this.column,
                    mouseEvent,
                    positionBy: 'mouse',
                });
            },
            showFilter: (buttonElement: HTMLElement) => {
                this.menuService.showFilterMenu({
                    column: this.column,
                    buttonElement: buttonElement,
                    containerType: 'columnFilter',
                    positionBy: 'button',
                });
            },
            progressSort: (multiSort?: boolean) => {
                this.beans.sortController.progressSort(this.column, !!multiSort, 'uiColumnSorted');
            },
            setSort: (sort: SortDirection, multiSort?: boolean) => {
                this.beans.sortController.setSortForColumn(this.column, sort, !!multiSort, 'uiColumnSorted');
            },
            eGridHeader: this.getGui(),
            setTooltip: (value: string, shouldDisplayTooltip: () => boolean) => {
                this.setupTooltip(value, shouldDisplayTooltip);
            },
        });

        return params;
    }

    private setupSelectAll(): void {
        this.selectAllFeature = this.createManagedBean(new SelectAllFeature(this.column));
        this.selectAllFeature.setComp(this);
    }

    public getSelectAllGui(): HTMLElement {
        return this.selectAllFeature.getCheckboxGui();
    }

    protected override handleKeyDown(e: KeyboardEvent): void {
        super.handleKeyDown(e);

        if (e.key === KeyCode.SPACE) {
            this.selectAllFeature.onSpaceKeyDown(e);
        }
        if (e.key === KeyCode.ENTER) {
            this.onEnterKeyDown(e);
        }
        if (e.key === KeyCode.DOWN && e.altKey) {
            this.showMenuOnKeyPress(e, false);
        }
    }

    private onEnterKeyDown(e: KeyboardEvent): void {
        if (e.ctrlKey || e.metaKey) {
            this.showMenuOnKeyPress(e, true);
        } else if (this.sortable) {
            const multiSort = e.shiftKey;
            this.beans.sortController.progressSort(this.column, multiSort, 'uiColumnSorted');
        }
    }

    private showMenuOnKeyPress(e: KeyboardEvent, isFilterShortcut: boolean): void {
        const headerComp = this.comp.getUserCompInstance();
        if (!headerComp || !(headerComp instanceof HeaderComp)) {
            return;
        }

        // the header comp knows what features are enabled, so let it handle the shortcut
        if (headerComp.onMenuKeyboardShortcut(isFilterShortcut)) {
            e.preventDefault();
        }
    }

    private onFocusIn(e: FocusEvent) {
        if (!this.getGui().contains(e.relatedTarget as HTMLElement)) {
            const rowIndex = this.getRowIndex();
            this.focusService.setFocusedHeader(rowIndex, this.column);
            this.announceAriaDescription();
        }

        if (this.focusService.isKeyboardMode()) {
            this.setActiveHeader(true);
        }
    }

    private onFocusOut(e: FocusEvent) {
        if (this.getGui().contains(e.relatedTarget as HTMLElement)) {
            return;
        }

        this.setActiveHeader(false);
    }

    private setupTooltip(value?: string, shouldDisplayTooltip?: () => boolean): void {
        if (this.tooltipFeature) {
            this.tooltipFeature = this.destroyBean(this.tooltipFeature);
        }

        const isTooltipWhenTruncated = this.gos.get('tooltipShowMode') === 'whenTruncated';
        const eGui = this.eGui;
        const colDef = this.column.getColDef();

        if (!shouldDisplayTooltip && isTooltipWhenTruncated && !colDef.headerComponent) {
            shouldDisplayTooltip = () => {
                const textEl = eGui.querySelector('.ag-header-cell-text');
                if (!textEl) {
                    return true;
                }

                return textEl.scrollWidth > textEl.clientWidth;
            };
        }

        const tooltipCtrl: ITooltipFeatureCtrl = {
            getColumn: () => this.column,
            getColDef: () => this.column.getColDef(),
            getGui: () => eGui,
            getLocation: () => 'header',
            getTooltipValue: () => {
                if (value != null) {
                    return value;
                }

                const res = this.column.getColDef().headerTooltip;
                return res;
            },
            shouldDisplayTooltip,
        };

        const tooltipFeature = this.createManagedBean(new TooltipFeature(tooltipCtrl));
        this.refreshFunctions.push(() => tooltipFeature.refreshToolTip());
    }

    private setupClassesFromColDef(): void {
        const refreshHeaderClasses = () => {
            const colDef = this.column.getColDef();
            const classes = _getHeaderClassesFromColDef(colDef, this.gos, this.column, null);

            const oldClasses = this.userHeaderClasses;
            this.userHeaderClasses = new Set(classes);

            classes.forEach((c) => {
                if (oldClasses.has(c)) {
                    // class already added, no need to apply it, but remove from old set
                    oldClasses.delete(c);
                } else {
                    // class new since last time, so apply it
                    this.comp.addOrRemoveCssClass(c, true);
                }
            });

            // now old set only has classes that were applied last time, but not this time, so remove them
            oldClasses.forEach((c) => this.comp.addOrRemoveCssClass(c, false));
        };

        this.refreshFunctions.push(refreshHeaderClasses);
        refreshHeaderClasses();
    }

    public setDragSource(eSource: HTMLElement | undefined): void {
        this.dragSourceElement = eSource;
        this.removeDragSource();

        if (!eSource || !this.draggable) {
            return;
        }

        const { column, beans, displayName, dragAndDropService, gos } = this;
        const { columnModel } = beans;

        let hideColumnOnExit = !this.gos.get('suppressDragLeaveHidesColumns');
        const dragSource = (this.dragSource = {
            type: DragSourceType.HeaderCell,
            eElement: eSource,
            getDefaultIconName: () => (hideColumnOnExit ? 'hide' : 'notAllowed'),
            getDragItem: () => this.createDragItem(column),
            dragItemName: displayName,
            onDragStarted: () => {
                hideColumnOnExit = !gos.get('suppressDragLeaveHidesColumns');
                column.setMoving(true, 'uiColumnMoved');
            },
            onDragStopped: () => column.setMoving(false, 'uiColumnMoved'),
            onGridEnter: (dragItem) => {
                if (hideColumnOnExit) {
                    const unlockedColumns = dragItem?.columns?.filter((col) => !col.getColDef().lockVisible) || [];
                    columnModel.setColsVisible(unlockedColumns as AgColumn[], true, 'uiColumnMoved');
                }
            },
            onGridExit: (dragItem) => {
                if (hideColumnOnExit) {
                    const unlockedColumns = dragItem?.columns?.filter((col) => !col.getColDef().lockVisible) || [];
                    columnModel.setColsVisible(unlockedColumns as AgColumn[], false, 'uiColumnMoved');
                }
            },
        });

        dragAndDropService.addDragSource(dragSource, true);
    }

    private createDragItem(column: AgColumn): DragItem {
        const visibleState: { [key: string]: boolean } = {};
        visibleState[column.getId()] = column.isVisible();

        return {
            columns: [column],
            visibleState: visibleState,
        };
    }

    private updateState(): void {
        this.menuEnabled = this.menuService.isColumnMenuInHeaderEnabled(this.column);
        this.openFilterEnabled = this.menuService.isFilterMenuInHeaderEnabled(this.column);
        this.sortable = this.column.isSortable();
        this.displayName = this.calculateDisplayName();
        this.draggable = this.workOutDraggable();
    }

    public addRefreshFunction(func: () => void): void {
        this.refreshFunctions.push(func);
    }

    private refresh(): void {
        this.updateState();
        this.refreshHeaderComp();
        this.refreshAria();
        this.refreshFunctions.forEach((f) => f());
    }

    private refreshHeaderComp(): void {
        const newCompDetails = this.lookupUserCompDetails();

        const compInstance = this.comp.getUserCompInstance();

        // only try refresh if old comp exists adn it is the correct type
        const attemptRefresh =
            compInstance != null && this.userCompDetails.componentClass == newCompDetails.componentClass;

        const headerCompRefreshed = attemptRefresh ? this.attemptHeaderCompRefresh(newCompDetails.params) : false;

        if (headerCompRefreshed) {
            // we do this as a refresh happens after colDefs change, and it's possible the column has had it's
            // draggable property toggled. no need to call this if not refreshing, as setDragSource is done
            // as part of appendHeaderComp
            this.setDragSource(this.dragSourceElement);
        } else {
            this.setCompDetails(newCompDetails);
        }
    }

    public attemptHeaderCompRefresh(params: IHeaderParams): boolean {
        const headerComp = this.comp.getUserCompInstance();
        if (!headerComp) {
            return false;
        }

        // if no refresh method, then we want to replace the headerComp
        if (!headerComp.refresh) {
            return false;
        }

        const res = headerComp.refresh(params);

        return res;
    }

    private calculateDisplayName(): string | null {
        return this.beans.columnNameService.getDisplayNameForColumn(this.column, 'header', true);
    }

    private checkDisplayName(): void {
        // display name can change if aggFunc different, eg sum(Gold) is now max(Gold)
        if (this.displayName !== this.calculateDisplayName()) {
            this.refresh();
        }
    }

    private workOutDraggable(): boolean {
        const colDef = this.column.getColDef();
        const isSuppressMovableColumns = this.gos.get('suppressMovableColumns');

        const colCanMove = !isSuppressMovableColumns && !colDef.suppressMovable && !colDef.lockPosition;

        // we should still be allowed drag the column, even if it can't be moved, if the column
        // can be dragged to a rowGroup or pivot drop zone
        return !!colCanMove || !!colDef.enableRowGroup || !!colDef.enablePivot;
    }

    private onColumnRowGroupChanged(): void {
        this.checkDisplayName();
    }

    private onColumnPivotChanged(): void {
        this.checkDisplayName();
    }

    private onColumnValueChanged(): void {
        this.checkDisplayName();
    }

    private setupWidth(): void {
        const listener = () => {
            const columnWidth = this.column.getActualWidth();
            this.comp.setWidth(`${columnWidth}px`);
        };

        this.addManagedListeners(this.column, { widthChanged: listener });
        listener();
    }

    private setupMovingCss(): void {
        const listener = () => {
            // this is what makes the header go dark when it is been moved (gives impression to
            // user that the column was picked up).
            this.comp.addOrRemoveCssClass('ag-header-cell-moving', this.column.isMoving());
        };

        this.addManagedListeners(this.column, { movingChanged: listener });
        listener();
    }

    private setupMenuClass(): void {
        const listener = () => {
            this.comp.addOrRemoveCssClass('ag-column-menu-visible', this.column.isMenuVisible());
        };

        this.addManagedListeners(this.column, { menuVisibleChanged: listener });
        listener();
    }

    private setupSortableClass(): void {
        const updateSortableCssClass = () => {
            this.comp.addOrRemoveCssClass('ag-header-cell-sortable', !!this.sortable);
        };

        updateSortableCssClass();

        this.addRefreshFunction(updateSortableCssClass);
        this.addManagedEventListeners({ sortChanged: this.refreshAriaSort.bind(this) });
    }

    private setupFilterClass(): void {
        const listener = () => {
            const isFilterActive = this.column.isFilterActive();
            this.comp.addOrRemoveCssClass('ag-header-cell-filtered', isFilterActive);
            this.refreshAria();
        };

        this.addManagedListeners(this.column, { filterActiveChanged: listener });
        listener();
    }

    private setupWrapTextClass() {
        const listener = () => {
            const wrapText = !!this.column.getColDef().wrapHeaderText;
            this.comp.addOrRemoveCssClass('ag-header-cell-wrap-text', wrapText);
        };
        listener();
        this.addRefreshFunction(listener);
    }

    protected override onDisplayedColumnsChanged(): void {
        super.onDisplayedColumnsChanged();
        if (!this.isAlive()) {
            return;
        }
        this.onHeaderHeightChanged();
    }

    private onHeaderHeightChanged() {
        this.refreshSpanHeaderHeight();
    }

    private refreshSpanHeaderHeight() {
        const { eGui, column, comp, beans } = this;
        if (!column.isSpanHeaderHeight()) {
            eGui.style.removeProperty('top');
            eGui.style.removeProperty('height');
            comp.addOrRemoveCssClass('ag-header-span-height', false);
            comp.addOrRemoveCssClass('ag-header-span-total', false);
            return;
        }

        const { numberOfParents, isSpanningTotal } = this.column.getColumnGroupPaddingInfo();

        comp.addOrRemoveCssClass('ag-header-span-height', numberOfParents > 0);

        const { columnModel } = beans;

        const headerHeight = columnModel.getColumnHeaderRowHeight();
        if (numberOfParents === 0) {
            // if spanning has stopped then need to reset these values.
            comp.addOrRemoveCssClass('ag-header-span-total', false);
            eGui.style.setProperty('top', `0px`);
            eGui.style.setProperty('height', `${headerHeight}px`);
            return;
        }

        comp.addOrRemoveCssClass('ag-header-span-total', isSpanningTotal);
        const groupHeaderHeight = this.beans.columnModel.getGroupRowsHeight();

        let extraHeight = 0;
        for (let i = 0; i < numberOfParents; i++) {
            extraHeight += groupHeaderHeight[groupHeaderHeight.length - 1 - i];
        }

        eGui.style.setProperty('top', `${-extraHeight}px`);
        eGui.style.setProperty('height', `${headerHeight + extraHeight}px`);
    }

    private refreshAriaSort(): void {
        if (this.sortable) {
            const translate = this.localeService.getLocaleTextFunc();
            const sort = this.beans.sortController.getDisplaySortForColumn(this.column) || null;
            this.comp.setAriaSort(_getAriaSortState(sort));
            this.setAriaDescriptionProperty('sort', translate('ariaSortableColumn', 'Press ENTER to sort'));
        } else {
            this.comp.setAriaSort();
            this.setAriaDescriptionProperty('sort', null);
        }
    }

    private refreshAriaMenu(): void {
        if (this.menuEnabled) {
            const translate = this.localeService.getLocaleTextFunc();
            this.setAriaDescriptionProperty('menu', translate('ariaMenuColumn', 'Press ALT DOWN to open column menu'));
        } else {
            this.setAriaDescriptionProperty('menu', null);
        }
    }

    private refreshAriaFilterButton(): void {
        if (this.openFilterEnabled && !this.menuService.isLegacyMenuEnabled()) {
            const translate = this.localeService.getLocaleTextFunc();
            this.setAriaDescriptionProperty(
                'filterButton',
                translate('ariaFilterColumn', 'Press CTRL ENTER to open filter')
            );
        } else {
            this.setAriaDescriptionProperty('filterButton', null);
        }
    }

    private refreshAriaFiltered(): void {
        const translate = this.localeService.getLocaleTextFunc();
        const isFilterActive = this.column.isFilterActive();
        if (isFilterActive) {
            this.setAriaDescriptionProperty('filter', translate('ariaColumnFiltered', 'Column Filtered'));
        } else {
            this.setAriaDescriptionProperty('filter', null);
        }
    }

    public setAriaDescriptionProperty(property: HeaderAriaDescriptionKey, value: string | null): void {
        if (value != null) {
            this.ariaDescriptionProperties.set(property, value);
        } else {
            this.ariaDescriptionProperties.delete(property);
        }
    }

    public announceAriaDescription(): void {
        if (!this.eGui.contains(this.beans.gos.getActiveDomElement())) {
            return;
        }
        const ariaDescription = Array.from(this.ariaDescriptionProperties.keys())
            // always announce the filter description first
            .sort((a: string, b: string) => (a === 'filter' ? -1 : b.charCodeAt(0) - a.charCodeAt(0)))
            .map((key: HeaderAriaDescriptionKey) => this.ariaDescriptionProperties.get(key))
            .join('. ');

        this.beans.ariaAnnouncementService.announceValue(ariaDescription, 'columnHeader');
    }

    private refreshAria(): void {
        this.refreshAriaSort();
        this.refreshAriaMenu();
        this.refreshAriaFilterButton();
        this.refreshAriaFiltered();
    }

    private addColumnHoverListener(): void {
        const listener = () => {
            if (!this.gos.get('columnHoverHighlight')) {
                return;
            }
            const isHovered = this.beans.columnHoverService.isHovered(this.column);
            this.comp.addOrRemoveCssClass('ag-column-hover', isHovered);
        };

        this.addManagedEventListeners({ columnHoverChanged: listener });
        listener();
    }

    public getColId(): string {
        return this.column.getColId();
    }

    private addActiveHeaderMouseListeners(): void {
        const listener = (e: MouseEvent) => this.handleMouseOverChange(e.type === 'mouseenter');
        const clickListener = () => this.dispatchColumnMouseEvent('columnHeaderClicked', this.column);
        const contextMenuListener = (event: MouseEvent) =>
            this.handleContextMenuMouseEvent(event, undefined, this.column);

        this.addManagedListeners(this.getGui(), {
            mouseenter: listener,
            mouseleave: listener,
            click: clickListener,
            contextmenu: contextMenuListener,
        });
    }

    private handleMouseOverChange(isMouseOver: boolean): void {
        this.setActiveHeader(isMouseOver);

        this.eventService.dispatchEvent({
            type: isMouseOver ? 'columnHeaderMouseOver' : 'columnHeaderMouseLeave',
            column: this.column,
        });
    }

    private setActiveHeader(active: boolean): void {
        this.comp.addOrRemoveCssClass('ag-header-active', active);
    }

    public getAnchorElementForMenu(isFilter?: boolean): HTMLElement {
        const headerComp = this.comp.getUserCompInstance();
        if (headerComp instanceof HeaderComp) {
            return headerComp.getAnchorElementForMenu(isFilter);
        }
        return this.getGui();
    }

    public override destroy(): void {
        super.destroy();

        (this.refreshFunctions as any) = null;
        (this.selectAllFeature as any) = null;
        (this.dragSourceElement as any) = null;
        (this.userCompDetails as any) = null;
        (this.userHeaderClasses as any) = null;
        (this.ariaDescriptionProperties as any) = null;
    }
}
