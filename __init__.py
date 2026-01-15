"""
ComfyUI QuickSave - Toolbar button for quick image saving

Adds a QuickSave button to the ComfyUI toolbar that saves the currently
displayed image to a quicksave folder with duplicate detection.

The JS extension adds the toolbar button, and the Python module
registers the /quicksave API endpoint.
"""

from .QuickSave import QuickSave

# WEB_DIRECTORY makes the 'js' folder available to ComfyUI frontend
WEB_DIRECTORY = "js"

NODE_CLASS_MAPPINGS = {
    "QuickSave": QuickSave,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "QuickSave": "QuickSave (API Loader)",
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
