import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
  OnChanges,
  SimpleChanges,
  TrackByFunction
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { MenuItem } from '../../services/menu.service';
import { Subject } from 'rxjs';
import { takeUntil, filter, distinctUntilChanged, map } from 'rxjs/operators';

/**
 * Componente recursivo para items del sidebar.
 * Principio SOLID (S): Solo renderiza un item del menú y sus hijos.
 * Principio SOLID (O): Extensible vía @Input sin modificar código base.
 */
@Component({
  selector: 'app-sidebar-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar-item.component.html',
  styleUrl: './sidebar-item.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarItemComponent implements OnInit, OnDestroy, OnChanges {
  @Input() item!: MenuItem;
  @Input() depth: number = 0;
  @Input() index: number = 0;
  @Input() expanded: boolean = false;
  @Input() sidebarCollapsed: boolean = false;
  @Input() currentExpandedItemIndex: number[] = [];
  @Output() expandChange = new EventEmitter<{ depth: number; index: number }>();

  private readonly destroy$ = new Subject<void>();
  private isActiveValue = false;

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.initializeRouterSubscription();
  }

  ngOnInit(): void {
    this.updateActiveState(this.router.url);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sidebarCollapsed'] || changes['expanded']) {
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeRouterSubscription(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map((event: NavigationEnd) => event.url),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(url => {
        this.updateActiveState(url);
      });
  }

  toggleExpansion(index: number, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.item.items && this.item.items.length > 0) {
      this.expandChange.emit({ depth: this.depth, index });
    } else if (this.item.routerLink) {
      this.handleNavigation();
    }
  }

  private handleNavigation(): void {
    if (this.item.routerLink) {
      const route = Array.isArray(this.item.routerLink)
        ? this.item.routerLink
        : [this.item.routerLink];
      this.router.navigate(route).then((success) => {
        if (success) {
          setTimeout(() => this.updateActiveState(this.router.url), 0);
        }
      });
    }
  }

  handleExpandChange(event: { depth: number; index: number }): void {
    this.expandChange.emit(event);
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  isActive(): boolean {
    return this.isActiveValue;
  }

  private updateActiveState(currentUrl: string): void {
    if (!this.item.routerLink) {
      if (this.isActiveValue) {
        this.isActiveValue = false;
        this.cdr.markForCheck();
      }
      return;
    }

    const path = this.buildPath();
    const cleanCurrentUrl = currentUrl.split('?')[0].split('#')[0];
    const cleanPath = path.split('?')[0].split('#')[0];
    const isActive = this.checkActiveState(cleanCurrentUrl, cleanPath);

    if (this.isActiveValue !== isActive) {
      this.isActiveValue = isActive;
      this.cdr.markForCheck();
    }
  }

  private checkActiveState(currentUrl: string, itemPath: string): boolean {
    const normalize = (url: string) => (url.startsWith('/') ? url : '/' + url);
    const normalizedCurrent = normalize(currentUrl);
    const normalizedItem = normalize(itemPath);

    if (normalizedCurrent === normalizedItem) return true;
    if (normalizedCurrent.startsWith(normalizedItem + '/')) return true;
    return false;
  }

  private buildPath(): string {
    return Array.isArray(this.item.routerLink)
      ? '/' + this.item.routerLink.join('/')
      : '/' + this.item.routerLink;
  }

  hasActiveChild(): boolean {
    if (!this.item.items || this.item.items.length === 0) return false;
    return this.checkChildrenActive(this.item.items);
  }

  private checkChildrenActive(items: MenuItem[]): boolean {
    let currentUrl = this.router.url;
    if (currentUrl.includes('#')) {
      currentUrl = currentUrl.split('#')[1] || '/';
    }
    currentUrl = currentUrl.split('?')[0];

    for (const child of items) {
      if (child.routerLink) {
        let childPath = Array.isArray(child.routerLink)
          ? '/' + child.routerLink.join('/')
          : '/' + child.routerLink;
        childPath = childPath.split('?')[0];
        if (!childPath.startsWith('/')) childPath = '/' + childPath;

        if (currentUrl === childPath || currentUrl.startsWith(childPath + '/')) {
          return true;
        }
      }
      if (child.items && child.items.length > 0) {
        if (this.checkChildrenActive(child.items)) return true;
      }
    }
    return false;
  }

  getTooltipText(): string {
    return this.sidebarCollapsed ? (this.item.label || '') : '';
  }

  trackBySubItem: TrackByFunction<MenuItem> = (index: number, item: MenuItem) => {
    return item.id || item.label || index;
  }
}
