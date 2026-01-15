"""
QuickSave Backend - API endpoint for the QuickSave toolbar button.

This module registers the /quicksave POST endpoint that receives images
from the frontend and saves them to disk.
"""
import server
import os
import re
import base64
from aiohttp import web

# Default save directory: ComfyUI's output folder
# Can be overridden by passing savePath in the request
DEFAULT_OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)),
    "..", "..", "output", "quicksave"
)


@server.PromptServer.instance.routes.post("/quicksave")
async def handle_quick_save(request):
    """
    API endpoint at /quicksave that receives image data and saves it to disk.

    Expected JSON payload:
        - imageData: Base64-encoded image data (with data URL prefix)
        - filename: Original filename (will be sanitized)
        - savePath: Optional custom save directory

    Returns:
        - status: "success", "skipped", or "error"
        - message: Human-readable result message
    """
    try:
        data = await request.json()
        image_data_b64 = data.get("imageData")
        filename = data.get("filename", "saved_image.png")
        save_path_str = data.get("savePath", "")

        if not image_data_b64:
            return web.json_response(
                {"status": "error", "message": "Missing image data"},
                status=400
            )

        # Sanitize filename to prevent path traversal and special chars
        if filename:
            # Allow alphanumeric, dots, underscores, hyphens
            filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        else:
            filename = "saved_image.png"

        # Decode base64 image data
        # Format: "data:image/png;base64,iVBORw0KGgo..."
        try:
            header, encoded = image_data_b64.split(",", 1)
            image_data = base64.b64decode(encoded)
        except (ValueError, base64.binascii.Error) as e:
            return web.json_response(
                {"status": "error", "message": f"Invalid image data: {e}"},
                status=400
            )

        # Determine save directory
        if save_path_str and os.path.isdir(save_path_str):
            base_dir = save_path_str
        else:
            base_dir = DEFAULT_OUTPUT_DIR

        # Ensure directory exists
        os.makedirs(base_dir, exist_ok=True)

        initial_path = os.path.join(base_dir, filename)

        # Prevent overwriting and detect duplicates
        final_path = initial_path
        base, ext = os.path.splitext(initial_path)
        counter = 1

        while os.path.exists(final_path):
            try:
                with open(final_path, "rb") as f:
                    existing_data = f.read()

                if existing_data == image_data:
                    print(f"[QuickSave] Skipped duplicate: {final_path}")
                    return web.json_response({
                        "status": "skipped",
                        "message": f"Duplicate skipped: {os.path.basename(final_path)}"
                    })
            except Exception as e:
                print(f"[QuickSave] Warning: Could not check for duplicate: {e}")

            final_path = f"{base}_{counter}{ext}"
            counter += 1

        # Write the file
        with open(final_path, "wb") as f:
            f.write(image_data)

        print(f"[QuickSave] Saved: {final_path}")
        return web.json_response({
            "status": "success",
            "message": f"Saved to {final_path}"
        })

    except Exception as e:
        print(f"[QuickSave] Error: {e}")
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )


class QuickSave:
    """
    Dummy node class - exists only to ensure ComfyUI loads this module
    and registers the /quicksave web route above.

    The actual QuickSave functionality is in the toolbar button (JS)
    and the API endpoint (above).
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "Custom/QuickSave"

    def execute(self, **kwargs):
        return {}
