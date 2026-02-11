# Notes - ComfyUI QuickSave

Brief context for agents working with this package.

## Build / Run

**Installation:**
```bash
# Clone to ComfyUI custom_nodes directory
cd ComfyUI/custom_nodes
git clone https://github.com/Ckrest/comfyui-quicksave.git
systemctl --user restart comfyui  # or restart ComfyUI manually
```

**Development:**
- Python changes require ComfyUI restart
- JS changes require browser refresh

## Path Dependencies

| Path | Purpose |
|------|---------|
| `js/QuickSave.js` | Toolbar button UI |
| `QuickSave.py` | Backend save logic |

## Key Features

- Adds save button to image preview nodes
- Hash-based duplicate detection
- Saves to ComfyUI output directory
