import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Interfaz para items del menú lateral.
 */
export interface MenuItem {
  id?: string;
  label?: string;
  icon?: string;
  routerLink?: string | string[];
  items?: MenuItem[];
  data?: any;
  disabled?: boolean;
  separator?: boolean;
  command?: (event?: any) => void;
}

/**
 * Servicio que provee los items del menú.
 * Principio SOLID (S): Solo gestiona la estructura de navegación.
 * Principio SOLID (O): Abierto a extensión vía datos, cerrado a modificación.
 */
@Injectable({
  providedIn: 'root'
})
export class MenuService {
  private readonly menuItemsSubject = new BehaviorSubject<MenuItem[]>([]);

  constructor() {
    this.loadMenuItems();
  }

  /**
   * Obtiene los items del menú como observable.
   */
  getMenuItems$(): Observable<MenuItem[]> {
    return this.menuItemsSubject.asObservable();
  }

  /**
   * Obtiene los items del menú de forma síncrona.
   */
  getMenuItems(): MenuItem[] {
    return this.menuItemsSubject.value;
  }

  /**
   * Carga los items del menú.
   * En producción, se reemplazaría por una llamada HTTP.
   */
  private loadMenuItems(): void {
    const items: MenuItem[] = [
      {
        id: 'inicio',
        label: 'Inicio',
        icon: 'pi pi-home',
        routerLink: ['inicio', 'inicio']
      },
      // { id: 'Dashboard', label: 'Dashboard', icon: 'pi pi-chart-bar', routerLink: ['Dashboard'] },
      { 
        id: 'Reportes', 
        label: 'Reportes', 
        icon: 'pi pi-file-export', 
        routerLink: ['Reportes'] 
      },
      {
        id: 'RegistroMaletas',
        label: 'Registro de Maletas',
        icon: 'pi pi-cog',
        routerLink: ['RegistroMaletas']
        // items: [
        //   {
        //     id: 'config-usuarios',
        //     label: 'Usuarios',
        //     icon: 'pi pi-users',
        //     routerLink: ['configuracion', 'usuarios']
        //   },
        //   {
        //     id: 'config-roles',
        //     label: 'Roles',
        //     icon: 'pi pi-shield',
        //     routerLink: ['configuracion', 'roles']
        //   },
        //   {
        //     id: 'config-parametros',
        //     label: 'Parámetros',
        //     icon: 'pi pi-sliders-h',
        //     routerLink: ['configuracion', 'parametros']
        //   }
        // ]
      },
      // {
      //   id: 'PlanificacionRutas',
      //   label: 'Planificación de Rutas',
      //   icon: 'pi pi-wrench',
      //   routerLink: ['PlanificacionRutas']
      //   // items: [
      //   //   {
      //   //     id: 'herram-importar',
      //   //     label: 'Importar datos',
      //   //     icon: 'pi pi-upload',
      //   //     routerLink: ['herramientas', 'importar']
      //   //   },
      //   //   {
      //   //     id: 'herram-exportar',
      //   //     label: 'Exportar datos',
      //   //     icon: 'pi pi-download',
      //   //     routerLink: ['herramientas', 'exportar']
      //   //   }
      //   // ]
      // },
      {
        id: 'MonitoreoMapa',
        label: 'Operación diaria',
        icon: 'pi pi-map',
        routerLink: ['MonitoreoMapa']
      },
      {
        id: 'Simulacion',
        label: 'Simulación',
        icon: 'pi pi-play-circle',
        routerLink: ['Simulacion']
      },
      {
        id: 'GestionAeropuertos',
        label: 'Gestión de Aeropuertos',
        icon: 'pi pi-building',
        routerLink: ['GestionAeropuertos']
      },
      {
        id: 'GestionVuelos',
        label: 'Gestión de Vuelos',
        icon: 'pi pi-send',
        routerLink: ['GestionVuelos']
      }
    ];

    this.menuItemsSubject.next(items);
  }
}
