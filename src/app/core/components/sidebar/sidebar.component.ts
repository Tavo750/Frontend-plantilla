import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MenuService, MenuItem } from '../../services/menu.service';
import { SidebarItemComponent } from '../sidebar-item/sidebar-item.component';
import * as global from '../../../global';

/**
 * Componente Sidebar.
 * Principio SOLID (S): Solo gestiona la lista de items y su estado de expansión.
 * Principio SOLID (D): Depende de MenuService para obtener los items.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, SidebarItemComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent implements OnInit {
  titulo = global.titulo;
  version = global.version;

  @Input() open: boolean = true;

  menuItems: MenuItem[] = [];
  currentExpandedItemIndex: number[] = [];

  constructor(
    private readonly menuService: MenuService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.menuService.getMenuItems$().subscribe({
      next: (menuItems) => {
        this.menuItems = menuItems;
        this.expandMenuToMatchUrl(this.router.url.split('?')[0]);
      },
      error: () => {
        this.expandMenuToMatchUrl(this.router.url.split('?')[0]);
      }
    });
  }

  handleExpandChange(event: { depth: number; index: number }): void {
    const { depth, index } = event;

    if (this.currentExpandedItemIndex[depth] === index) {
      // Colapsar: limpiar el nivel actual y todos los hijos
      this.currentExpandedItemIndex[depth] = -1;
      this.currentExpandedItemIndex = this.currentExpandedItemIndex.slice(0, depth + 1);
      for (let i = depth + 1; i < 20; i++) {
        this.currentExpandedItemIndex[i] = -1;
      }
    } else {
      // Expandir nuevo y colapsar hermanos
      this.currentExpandedItemIndex[depth] = index;
      this.currentExpandedItemIndex = this.currentExpandedItemIndex.slice(0, depth + 1);
    }
  }

  expandMenuToMatchUrl(url: string): void {
    const expandedIndex: number[] = [];

    const findMatch = (items: MenuItem[], depth = 0): boolean => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let path = '';
        if (Array.isArray(item.routerLink)) {
          path = '/' + item.routerLink.join('/');
        } else if (typeof item.routerLink === 'string') {
          path = '/' + item.routerLink;
        }

        if (path && url.startsWith(path)) {
          expandedIndex[depth] = i;
          return true;
        }

        if (item.items && findMatch(item.items, depth + 1)) {
          expandedIndex[depth] = i;
          return true;
        }
      }
      return false;
    };

    if (findMatch(this.menuItems)) {
      this.currentExpandedItemIndex = [...expandedIndex];
    }
  }
}
