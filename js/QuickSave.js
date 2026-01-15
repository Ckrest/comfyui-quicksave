/**
 * QuickSave Extension for ComfyUI
 * Adds a toolbar button to quickly save generated images to a custom path.
 * Uses modern ComfyUI extension API patterns.
 */
import { app } from "/scripts/app.js";
import { ComfyButtonGroup } from "/scripts/ui/components/buttonGroup.js";
import { ComfyButton } from "/scripts/ui/components/button.js";

const EXTENSION_NAME = "QuickSave";
const BUTTON_GROUP_CLASS = "quicksave-button-group";
const SETTINGS_KEY = "quicksave.settings";
const MAX_ATTACH_ATTEMPTS = 120;

// Default settings
const DEFAULT_SETTINGS = {
    savePath: "",
    autoSave: false,
};

// Get settings from localStorage
const getSettings = () => {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
};

// Save settings to localStorage
const saveSettings = (settings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// Toast notification system
const showToast = (message, type = 'info', duration = 3500) => {
    let container = document.getElementById('quicksave-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'quicksave-toast-container';
        container.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 12px 18px;
        border-radius: 6px;
        color: white;
        font-family: sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        opacity: 0;
        transform: translateX(20px);
        transition: opacity 0.3s ease-out, transform 0.3s ease-out;
        max-width: 450px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const colors = {
        success: '#2E7D32',
        info: '#1976D2',
        error: '#C62828',
    };
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
};

// Find all images in the workflow
const findWorkflowImages = () => {
    const foundImages = [];
    const seenSources = new Set();
    const nodes = app.graph?._nodes || [];

    console.log(`[QuickSave] Scanning ${nodes.length} nodes for images...`);

    for (const node of nodes) {
        // Method 1: Check node.imgs (traditional LiteGraph image storage)
        if (node.imgs && Array.isArray(node.imgs) && node.imgs.length > 0) {
            for (const imageElement of node.imgs) {
                if (imageElement?.src && !seenSources.has(imageElement.src)) {
                    addImageFromSrc(foundImages, seenSources, imageElement.src, node);
                }
            }
        }

        // Method 2: Check node.images (alternative storage format)
        if (node.images && Array.isArray(node.images)) {
            for (const img of node.images) {
                // Could be {filename, subfolder, type} object
                if (img?.filename) {
                    const src = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
                    if (!seenSources.has(src)) {
                        foundImages.push({
                            src: src,
                            filename: img.filename,
                            nodeTitle: node.title || node.type,
                        });
                        seenSources.add(src);
                    }
                }
            }
        }

        // Method 3: Check widgets_values for image data (some nodes store here)
        if (node.widgets_values && Array.isArray(node.widgets_values)) {
            for (const val of node.widgets_values) {
                if (typeof val === 'object' && val?.filename) {
                    const src = `/view?filename=${encodeURIComponent(val.filename)}&subfolder=${encodeURIComponent(val.subfolder || '')}&type=${encodeURIComponent(val.type || 'output')}`;
                    if (!seenSources.has(src)) {
                        foundImages.push({
                            src: src,
                            filename: val.filename,
                            nodeTitle: node.title || node.type,
                        });
                        seenSources.add(src);
                    }
                }
            }
        }

        // Method 4: Check for imageIndex property (indicates node has images)
        if (typeof node.imageIndex === 'number' && node.imgs?.[node.imageIndex]) {
            const img = node.imgs[node.imageIndex];
            if (img?.src && !seenSources.has(img.src)) {
                addImageFromSrc(foundImages, seenSources, img.src, node);
            }
        }
    }

    // Method 5: Check the last execution output stored in app
    try {
        const lastNodeId = app.runningNodeId;
        const lastOutput = app.nodeOutputs;
        if (lastOutput) {
            for (const [nodeId, output] of Object.entries(lastOutput)) {
                if (output?.images && Array.isArray(output.images)) {
                    for (const img of output.images) {
                        if (img?.filename) {
                            const src = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
                            if (!seenSources.has(src)) {
                                const node = nodes.find(n => String(n.id) === String(nodeId));
                                foundImages.push({
                                    src: src,
                                    filename: img.filename,
                                    nodeTitle: node?.title || node?.type || `Node ${nodeId}`,
                                });
                                seenSources.add(src);
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.log("[QuickSave] Could not check app.nodeOutputs:", e);
    }

    console.log(`[QuickSave] Found ${foundImages.length} images`);
    return foundImages;
};

// Helper to extract image info from a src URL
const addImageFromSrc = (foundImages, seenSources, src, node) => {
    try {
        const url = new URL(src, window.location.origin);
        const filename = url.searchParams.get("filename");
        if (filename) {
            foundImages.push({
                src: src,
                filename: filename,
                nodeTitle: node.title || node.type,
            });
            seenSources.add(src);
        }
    } catch {
        // Invalid URL, skip
    }
};

// Save image via backend
const saveImageToBackend = async (image, savePath) => {
    try {
        const response = await fetch(image.src);
        const blob = await response.blob();

        const base64data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const res = await fetch("/quicksave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                imageData: base64data,
                filename: image.filename,
                savePath: savePath,
            }),
        });

        const result = await res.json();

        if (!res.ok) {
            showToast(result.message || "Backend error", 'error');
            return false;
        }

        const toastType = result.status === 'skipped' ? 'info' : 'success';
        showToast(result.message, toastType);
        return true;
    } catch (error) {
        console.error("[QuickSave] Error:", error);
        showToast("Failed to save. See console.", 'error');
        return false;
    }
};

// Show image selection modal
const showImageSelectionModal = (images) => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--comfy-menu-bg, #1a1a1a);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            text-align: center;
        `;

        const title = document.createElement('h2');
        title.textContent = 'Select an Image to Save';
        title.style.cssText = 'color: var(--fg-color, white); margin: 0 0 20px 0;';
        modal.appendChild(title);

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 15px;
        `;

        images.forEach(image => {
            const option = document.createElement('div');
            option.style.cssText = `
                cursor: pointer;
                border: 2px solid transparent;
                border-radius: 6px;
                transition: border-color 0.2s;
                padding: 5px;
            `;
            option.addEventListener('mouseenter', () => option.style.borderColor = '#2196F3');
            option.addEventListener('mouseleave', () => option.style.borderColor = 'transparent');

            const img = document.createElement('img');
            img.src = image.src;
            img.style.cssText = 'max-width: 100%; border-radius: 4px;';
            option.appendChild(img);

            const label = document.createElement('div');
            label.textContent = image.nodeTitle || image.filename;
            label.style.cssText = 'font-size: 12px; color: var(--fg-color, white); margin-top: 5px; overflow: hidden; text-overflow: ellipsis;';
            option.appendChild(label);

            option.addEventListener('click', () => {
                overlay.remove();
                resolve(image);
            });
            grid.appendChild(option);
        });

        modal.appendChild(grid);
        overlay.appendChild(modal);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(null);
            }
        });

        document.body.appendChild(overlay);
    });
};

// Show settings modal
const showSettingsModal = () => {
    const settings = getSettings();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background-color: var(--comfy-menu-bg, #1a1a1a);
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        min-width: 400px;
        color: var(--fg-color, white);
    `;

    modal.innerHTML = `
        <h2 style="margin: 0 0 20px 0;">QuickSave Settings</h2>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Default Save Path:</label>
            <input type="text" id="qs-save-path" value="${settings.savePath}"
                placeholder="/path/to/save/directory"
                style="width: 100%; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-color, #444);
                       background: var(--comfy-input-bg, #333); color: var(--fg-color, white); box-sizing: border-box;">
            <small style="color: #888; display: block; margin-top: 4px;">Leave empty to use plugin default path</small>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px;">
            <button id="qs-cancel" class="comfyui-button" style="padding: 8px 16px;">Cancel</button>
            <button id="qs-save" class="comfyui-button primary" style="padding: 8px 16px; background: #2196F3;">Save</button>
        </div>
    `;

    overlay.appendChild(modal);

    const pathInput = modal.querySelector('#qs-save-path');
    const cancelBtn = modal.querySelector('#qs-cancel');
    const saveBtn = modal.querySelector('#qs-save');

    cancelBtn.addEventListener('click', () => overlay.remove());
    saveBtn.addEventListener('click', () => {
        const newSettings = {
            ...settings,
            savePath: pathInput.value.trim(),
        };
        saveSettings(newSettings);
        showToast('Settings saved', 'success');
        overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    pathInput.focus();
};

// Handle quick save action
const handleQuickSave = async () => {
    const images = findWorkflowImages();
    const settings = getSettings();

    if (images.length === 0) {
        showToast("No images found. Generate an image first.", 'error');
        return;
    }

    if (images.length === 1) {
        await saveImageToBackend(images[0], settings.savePath);
    } else {
        const selectedImage = await showImageSelectionModal(images);
        if (selectedImage) {
            await saveImageToBackend(selectedImage, settings.savePath);
        }
    }
};

// Get QuickSave icon SVG
const getQuickSaveIcon = () => `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17,21 17,13 7,13 7,21"/>
        <polyline points="7,3 7,8 15,8"/>
    </svg>
`;

// Create toolbar button
const createQuickSaveButton = () => {
    const button = new ComfyButton({
        icon: "save",
        tooltip: "Quick Save Image (Right-click for settings)",
        app,
        enabled: true,
        classList: "comfyui-button comfyui-menu-mobile-collapse",
    });

    button.element.setAttribute("aria-label", "Quick Save");
    button.element.title = "Quick Save Image (Right-click for settings)";

    if (button.iconElement) {
        button.iconElement.innerHTML = getQuickSaveIcon();
        button.iconElement.style.width = "1.2rem";
        button.iconElement.style.height = "1.2rem";
    }

    // Left click = save
    button.element.addEventListener("click", (e) => {
        e.preventDefault();
        handleQuickSave();
    });

    // Right click = settings
    button.element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showSettingsModal();
    });

    return button;
};

// Attach button to toolbar
const attachQuickSaveButton = (attempt = 0) => {
    if (document.querySelector(`.${BUTTON_GROUP_CLASS}`)) {
        return; // Already attached
    }

    const settingsGroup = app.menu?.settingsGroup;
    if (!settingsGroup?.element?.parentElement) {
        if (attempt >= MAX_ATTACH_ATTEMPTS) {
            console.warn("[QuickSave] Could not find settings button group after max attempts");
            return;
        }
        requestAnimationFrame(() => attachQuickSaveButton(attempt + 1));
        return;
    }

    const quickSaveButton = createQuickSaveButton();
    const buttonGroup = new ComfyButtonGroup(quickSaveButton);
    buttonGroup.element.classList.add(BUTTON_GROUP_CLASS);

    // Insert before the settings group (same as LoRA Manager)
    settingsGroup.element.before(buttonGroup.element);
    console.log("[QuickSave] Toolbar button attached successfully");
};

// Register extension
app.registerExtension({
    name: `Comfy.${EXTENSION_NAME}`,
    aboutPageBadges: [{
        label: "QuickSave",
        url: "",
        icon: "pi pi-save",
    }],
    async setup() {
        attachQuickSaveButton();
    },
});
