import { UI } from '../../../UI.ts'
import { PropCatalog } from './PropCatalog.ts'
import { PropSide } from './PropSide.ts'
import { PropType } from './PropType.ts'
import { type PropSelection } from './PropSelection.ts'

export class PropsPanel extends EventTarget {
  private readonly ui: UI = UI.getInstance()
  private readonly selects = new Map<PropSide, HTMLSelectElement>()
  private dom_panel: HTMLElement | null = null
  private added_event_listeners: boolean = false

  public initialize (): void {
    if (this.added_event_listeners) {
      return
    }

    const mount = this.ui.dom_props_panel_mount
    if (mount === null) {
      return
    }

    mount.innerHTML = `
      <div class="props-panel" hidden>
        <div class="props-panel-header">Props</div>
        ${this.side_row_html(PropSide.Left, 'Left hand')}
        ${this.side_row_html(PropSide.Right, 'Right hand')}
      </div>
    `

    this.dom_panel = mount.querySelector('.props-panel')

    Object.values(PropSide).forEach((side) => {
      const select = mount.querySelector<HTMLSelectElement>(`#props-${side}-hand-select`)
      if (select === null) {
        return
      }

      this.selects.set(side, select)
      select.addEventListener('change', () => { this.dispatch_selection_changed() })
    })

    this.ui.dom_props_toggle_button?.addEventListener('click', () => {
      this.set_expanded(this.dom_panel?.hidden === true)
    })

    this.added_event_listeners = true
  }

  public set_visible (is_visible: boolean): void {
    if (this.ui.dom_props_toggle_button !== null) {
      this.ui.dom_props_toggle_button.style.display = is_visible ? '' : 'none'
    }

    if (!is_visible) {
      this.set_expanded(false)
    }
  }

  public set_side_enabled (side: PropSide, is_enabled: boolean): void {
    const select = this.selects.get(side)
    if (select === undefined) {
      return
    }

    select.disabled = !is_enabled
    select.title = is_enabled ? '' : 'No hand bone was found for this side'
  }

  public set_selection (selection: PropSelection): void {
    const left_select = this.selects.get(PropSide.Left)
    const right_select = this.selects.get(PropSide.Right)

    if (left_select !== undefined) { left_select.value = selection.left }
    if (right_select !== undefined) { right_select.value = selection.right }
  }

  private set_expanded (is_expanded: boolean): void {
    if (this.dom_panel !== null) {
      this.dom_panel.hidden = !is_expanded
    }

    const toggle_button = this.ui.dom_props_toggle_button
    if (toggle_button !== null) {
      toggle_button.setAttribute('aria-expanded', String(is_expanded))
      toggle_button.classList.toggle('active', is_expanded)
    }
  }

  private side_row_html (side: PropSide, label: string): string {
    const options_html = [
      `<option value="${PropType.None}">None</option>`,
      ...PropCatalog.all().map((definition) => `<option value="${definition.type}">${definition.display_name}</option>`)
    ].join('')

    return `
      <label class="props-panel-row" for="props-${side}-hand-select">
        <span>${label}</span>
        <select id="props-${side}-hand-select">${options_html}</select>
      </label>
    `
  }

  private selected_prop (side: PropSide): PropType {
    const value = this.selects.get(side)?.value
    return Object.values(PropType).includes(value as PropType) ? value as PropType : PropType.None
  }

  private dispatch_selection_changed (): void {
    const selection: PropSelection = {
      left: this.selected_prop(PropSide.Left),
      right: this.selected_prop(PropSide.Right)
    }

    this.dispatchEvent(new CustomEvent<PropSelection>('props-selection-changed', { detail: selection }))
  }
}
