import { SkeletonType } from '../../enums/SkeletonType.ts'

export enum BoneNamingStructure {
  Default = 'default',
  Mixamo = 'mixamo'
}

export enum ExportContents {
  Full = 'full',
  Skeleton = 'skeleton'
}

export enum ExportFormat {
  GLB = 'glb',
  FBX = 'fbx'
}

export enum FbxExportPreset {
  Unreal = 'unreal',
  Blender = 'blender',
  ThreeJS = 'threejs',
  Unity = 'unity',
  Maya = 'maya'
}

export class DownloadSettings extends EventTarget {
  private selected_bone_naming_structure: BoneNamingStructure = BoneNamingStructure.Default
  private selected_export_contents: ExportContents = ExportContents.Full
  private selected_export_format: ExportFormat = ExportFormat.GLB
  private selected_fbx_export_preset: FbxExportPreset = FbxExportPreset.Blender
  private dom_download_settings_popup: HTMLElement | null = null
  private dom_download_settings_toggle: HTMLButtonElement | null = null
  private dom_download_settings_panel: HTMLElement | null = null
  private dom_bone_naming_section: HTMLElement | null = null
  private dom_bone_naming_group: HTMLElement | null = null
  private dom_bone_naming_default_radio: HTMLInputElement | null = null
  private dom_export_contents_group: HTMLElement | null = null
  private dom_export_contents_full_radio: HTMLInputElement | null = null
  private dom_export_format_group: HTMLElement | null = null
  private dom_export_format_glb_radio: HTMLInputElement | null = null
  private dom_fbx_preset_section: HTMLElement | null = null
  private dom_fbx_preset_group: HTMLElement | null = null
  private dom_fbx_preset_blender_radio: HTMLInputElement | null = null

  constructor () {
    super()
    this.initialize_dom_elements()
    this.update_fbx_preset_ui_visibility()
    this.add_event_listeners()
  }

  public bone_naming_structure (): BoneNamingStructure {
    return this.selected_bone_naming_structure
  }

  public export_contents (): ExportContents {
    return this.selected_export_contents
  }

  public export_format (): ExportFormat {
    return this.selected_export_format
  }

  public fbx_export_preset (): FbxExportPreset {
    return this.selected_fbx_export_preset
  }

  // The download settings popup is available for all skeleton types. The bone naming
  // options only apply to the human skeleton, so that section is shown/hidden here while
  // the export contents options remain available regardless of skeleton type.
  public update_download_settings_ui_visibility (skeleton_type: SkeletonType): void {
    // reset to defaults
    this.selected_bone_naming_structure = BoneNamingStructure.Default
    if (this.dom_bone_naming_default_radio !== null) {
      this.dom_bone_naming_default_radio.checked = true
    }

    this.selected_export_contents = ExportContents.Full
    if (this.dom_export_contents_full_radio !== null) {
      this.dom_export_contents_full_radio.checked = true
    }

    this.selected_export_format = ExportFormat.GLB
    if (this.dom_export_format_glb_radio !== null) {
      this.dom_export_format_glb_radio.checked = true
    }

    this.selected_fbx_export_preset = FbxExportPreset.Blender
    if (this.dom_fbx_preset_blender_radio !== null) {
      this.dom_fbx_preset_blender_radio.checked = true
    }

    const is_human_skeleton = skeleton_type === SkeletonType.Human

    // Only the bone naming section is human-only; the popup itself is always available.
    if (this.dom_bone_naming_section !== null) {
      this.dom_bone_naming_section.style.display = is_human_skeleton ? '' : 'none'
    }

    this.update_fbx_preset_ui_visibility()
  }

  private initialize_dom_elements (): void {
    this.dom_download_settings_popup = document.querySelector('#download-settings-popup')
    this.dom_download_settings_toggle = document.querySelector('#download-settings-toggle')
    this.dom_download_settings_panel = document.querySelector('#download-settings')
    this.dom_bone_naming_section = document.querySelector('#download-bone-naming-section')
    this.dom_bone_naming_group = document.querySelector('#download-bone-naming-group')
    this.dom_bone_naming_default_radio = document.querySelector('#bone-naming-default')
    this.dom_export_contents_group = document.querySelector('#download-export-contents-group')
    this.dom_export_contents_full_radio = document.querySelector('#export-contents-full')
    this.dom_export_format_group = document.querySelector('#download-export-format-group')
    this.dom_export_format_glb_radio = document.querySelector('#export-format-glb')
    this.dom_fbx_preset_section = document.querySelector('#download-fbx-preset-section')
    this.dom_fbx_preset_group = document.querySelector('#download-fbx-preset-group')
    this.dom_fbx_preset_blender_radio = document.querySelector('#fbx-preset-blender')
  }

  private add_event_listeners (): void {
    this.dom_download_settings_toggle?.addEventListener('click', () => {
      this.set_popup_visibility(this.dom_download_settings_panel?.hidden !== false)
    })

    document.addEventListener('click', (event: MouseEvent) => {
      if (this.dom_download_settings_panel?.hidden !== false) {
        return
      }

      const clicked_element = event.target as Node | null
      if (clicked_element === null) {
        return
      }

      if (this.dom_download_settings_popup?.contains(clicked_element) !== true) {
        this.set_popup_visibility(false)
      }
    })

    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.set_popup_visibility(false)
      }
    })

    this.dom_bone_naming_group?.addEventListener('change', (event: Event) => {
      const selected_radio = event.target as HTMLInputElement | null

      if (selected_radio === null || selected_radio.name !== 'bone-naming-structure') {
        return
      }

      this.selected_bone_naming_structure =
        selected_radio.value === BoneNamingStructure.Mixamo
          ? BoneNamingStructure.Mixamo
          : BoneNamingStructure.Default

      this.dispatchEvent(new CustomEvent('bone-naming-structure-changed', {
        detail: { boneNamingStructure: this.selected_bone_naming_structure }
      }))
    })

    this.dom_export_contents_group?.addEventListener('change', (event: Event) => {
      const selected_radio = event.target as HTMLInputElement | null

      if (selected_radio === null || selected_radio.name !== 'export-contents') {
        return
      }

      this.selected_export_contents =
        selected_radio.value === ExportContents.Skeleton
          ? ExportContents.Skeleton
          : ExportContents.Full

      this.dispatchEvent(new CustomEvent('export-contents-changed', {
        detail: { exportContents: this.selected_export_contents }
      }))
    })

    this.dom_export_format_group?.addEventListener('change', (event: Event) => {
      const selected_radio = event.target as HTMLInputElement | null

      if (selected_radio === null || selected_radio.name !== 'export-format') {
        return
      }

      this.selected_export_format =
        selected_radio.value === ExportFormat.FBX
          ? ExportFormat.FBX
          : ExportFormat.GLB

      this.dispatchEvent(new CustomEvent('export-format-changed', {
        detail: { exportFormat: this.selected_export_format }
      }))

      this.update_fbx_preset_ui_visibility()
    })

    this.dom_fbx_preset_group?.addEventListener('change', (event: Event) => {
      const selected_radio = event.target as HTMLInputElement | null

      if (selected_radio === null || selected_radio.name !== 'fbx-export-preset') {
        return
      }

      switch (selected_radio.value) {
        case FbxExportPreset.Unreal:
          this.selected_fbx_export_preset = FbxExportPreset.Unreal
          break
        case FbxExportPreset.ThreeJS:
          this.selected_fbx_export_preset = FbxExportPreset.ThreeJS
          break
        case FbxExportPreset.Unity:
          this.selected_fbx_export_preset = FbxExportPreset.Unity
          break
        case FbxExportPreset.Maya:
          this.selected_fbx_export_preset = FbxExportPreset.Maya
          break
        default:
          this.selected_fbx_export_preset = FbxExportPreset.Blender
          break
      }

      this.dispatchEvent(new CustomEvent('fbx-export-preset-changed', {
        detail: { fbxExportPreset: this.selected_fbx_export_preset }
      }))
    })
  }

  private update_fbx_preset_ui_visibility (): void {
    if (this.dom_fbx_preset_section === null) {
      return
    }

    const should_show_fbx_preset = this.selected_export_format === ExportFormat.FBX
    this.dom_fbx_preset_section.hidden = !should_show_fbx_preset
  }

  private set_popup_visibility (is_visible: boolean): void {
    if (this.dom_download_settings_panel !== null) {
      this.dom_download_settings_panel.hidden = !is_visible
    }

    if (this.dom_download_settings_toggle !== null) {
      this.dom_download_settings_toggle.setAttribute('aria-expanded', is_visible ? 'true' : 'false')
    }
  }
}
