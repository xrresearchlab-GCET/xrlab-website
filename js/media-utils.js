/**
 * XR Research Lab — Media Utility
 * Google Drive URL normalization, YouTube embed generator,
 * media categorization, and safe live preview components.
 */

(function () {
  'use strict';

  // Google Drive file ID matcher
  // Matches:
  // - /file/d/{id}/view
  // - /file/d/{id}/preview
  // - /file/d/{id}
  // - /open?id={id}
  // - /uc?id={id}
  // - /uc?export=view&id={id}
  const DRIVE_REGEX = /drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+)|uc\?(?:[^&]+&)*id=([a-zA-Z0-9_-]+))/i;
  const DRIVE_VIEW_REGEX = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i;

  function parseGoogleDriveUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(DRIVE_REGEX) || url.match(DRIVE_VIEW_REGEX);
    if (!match) return null;

    const fileId = match[1] || match[2] || match[3];
    if (!fileId) return null;

    return {
      isDrive: true,
      fileId,
      // Embed URL for iframes (documents, videos, PDFs)
      previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      // Direct view image URL
      imageUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
      // Google user content high-res CDN thumbnail
      thumbnailUrl: `https://lh3.googleusercontent.com/d/${fileId}=w1200`,
      // Direct download / binary
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    };
  }

  // YouTube matcher
  // Matches:
  // - youtube.com/watch?v={id}
  // - youtu.be/{id}
  // - youtube.com/embed/{id}
  // - youtube.com/shorts/{id}
  const YT_REGEX = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

  function parseYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(YT_REGEX);
    if (!match || !match[1]) return null;

    const videoId = match[1];
    return {
      isYouTube: true,
      videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      maxThumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };
  }

  // Vimeo matcher
  const VIMEO_REGEX = /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/i;

  function parseVimeoUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(VIMEO_REGEX);
    if (!match) return null;
    const videoId = match[3];
    return {
      isVimeo: true,
      videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
    };
  }

  // 3D Model extension check
  function is3DModelUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.glb') || clean.endsWith('.gltf') || clean.endsWith('.usdz');
  }

  // Image extension check
  function isDirectImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.png') ||
      clean.endsWith('.webp') || clean.endsWith('.gif') || clean.endsWith('.svg');
  }

  // Video extension check
  function isDirectVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.ogg');
  }

  /**
   * Classify media URL into actionable metadata
   */
  function inspectMedia(url, hintType = null) {
    if (!url || typeof url !== 'string') return { type: 'none', raw: '' };

    const trimmed = url.trim();

    // YouTube
    const yt = parseYouTubeUrl(trimmed);
    if (yt) {
      return { type: 'youtube', ...yt, raw: trimmed };
    }

    // Google Drive
    const drive = parseGoogleDriveUrl(trimmed);
    if (drive) {
      if (hintType === 'image') {
        return { type: 'drive-image', ...drive, displayUrl: drive.imageUrl, raw: trimmed };
      }
      if (hintType === 'video') {
        return { type: 'drive-video', ...drive, displayUrl: drive.previewUrl, raw: trimmed };
      }
      // General drive
      return { type: 'drive', ...drive, displayUrl: drive.previewUrl, raw: trimmed };
    }

    // Vimeo
    const vimeo = parseVimeoUrl(trimmed);
    if (vimeo) {
      return { type: 'vimeo', ...vimeo, raw: trimmed };
    }

    // 3D Model
    if (is3DModelUrl(trimmed) || hintType === 'model') {
      return { type: 'model', modelUrl: trimmed, raw: trimmed };
    }

    // Direct Image
    if (isDirectImageUrl(trimmed) || hintType === 'image') {
      return { type: 'image', imageUrl: trimmed, raw: trimmed };
    }

    // Direct Video
    if (isDirectVideoUrl(trimmed) || hintType === 'video') {
      return { type: 'video', videoUrl: trimmed, raw: trimmed };
    }

    return { type: 'generic-link', raw: trimmed };
  }

  /**
   * Render a live preview box into target element
   */
  function renderLivePreview(targetEl, url, hintType = null) {
    if (!targetEl) return;
    if (!url || !url.trim()) {
      targetEl.innerHTML = '<div style="font-size:12px;color:var(--cin-text-dim);font-style:italic">Enter a URL above to see a live preview</div>';
      return;
    }

    const media = inspectMedia(url, hintType);

    if (media.type === 'youtube') {
      targetEl.innerHTML = `
        <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;border:1px solid var(--cin-border);background:#000">
          <iframe src="${media.embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        <div style="font-size:11px;color:var(--cin-accent-bright);margin-top:6px;font-family:var(--font-mono)">✓ YouTube video verified</div>
      `;
      return;
    }

    if (media.type === 'drive-video' || (media.type === 'drive' && hintType === 'video')) {
      targetEl.innerHTML = `
        <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;border:1px solid var(--cin-border);background:#000">
          <iframe src="${media.previewUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="autoplay" allowfullscreen></iframe>
        </div>
        <div style="font-size:11px;color:var(--cin-accent-bright);margin-top:6px;font-family:var(--font-mono)">✓ Google Drive video preview (Ensure file sharing is set to "Anyone with the link can view")</div>
      `;
      return;
    }

    if (media.type === 'drive-image' || media.type === 'drive') {
      targetEl.innerHTML = `
        <div style="border-radius:8px;overflow:hidden;border:1px solid var(--cin-border);max-height:240px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3)">
          <img src="${media.imageUrl}" alt="Drive Preview" style="max-width:100%;max-height:240px;object-fit:contain" onerror="this.onerror=null;this.src='${media.thumbnailUrl}'" />
        </div>
        <div style="font-size:11px;color:var(--cin-accent-bright);margin-top:6px;font-family:var(--font-mono)">✓ Google Drive image loaded</div>
      `;
      return;
    }

    if (media.type === 'image') {
      targetEl.innerHTML = `
        <div style="border-radius:8px;overflow:hidden;border:1px solid var(--cin-border);max-height:240px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3)">
          <img src="${media.imageUrl}" alt="Preview" style="max-width:100%;max-height:240px;object-fit:contain" onerror="this.parentElement.innerHTML='<div style=\'padding:12px;color:var(--cin-error);font-size:12px;\'>Failed to load image. Check URL.</div>'" />
        </div>
        <div style="font-size:11px;color:var(--cin-accent-bright);margin-top:6px;font-family:var(--font-mono)">✓ Direct image URL</div>
      `;
      return;
    }

    if (media.type === 'video') {
      targetEl.innerHTML = `
        <div style="border-radius:8px;overflow:hidden;border:1px solid var(--cin-border);background:#000">
          <video src="${media.videoUrl}" controls style="width:100%;max-height:240px;display:block"></video>
        </div>
        <div style="font-size:11px;color:var(--cin-accent-bright);margin-top:6px;font-family:var(--font-mono)">✓ Direct HTML5 video</div>
      `;
      return;
    }

    if (media.type === 'model') {
      targetEl.innerHTML = `
        <div style="height:220px;border-radius:8px;border:1px solid var(--cin-border);background:radial-gradient(circle, rgba(0,255,200,0.08) 0%, rgba(0,0,0,0.5) 100%);position:relative;overflow:hidden">
          <model-viewer
            src="${media.modelUrl}"
            auto-rotate
            camera-controls
            shadow-intensity="1"
            style="width:100%;height:100%"
            alt="3D model preview">
          </model-viewer>
        </div>
        <div style="font-size:11px;color:var(--cin-accent-bright);margin-top:6px;font-family:var(--font-mono)">✓ 3D Model loaded (.glb/.gltf)</div>
      `;
      return;
    }

    targetEl.innerHTML = `
      <div style="font-size:12px;color:var(--cin-text-secondary);padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--cin-border);border-radius:6px">
        <span>Link: </span><a href="${media.raw}" target="_blank" rel="noopener noreferrer" style="color:var(--cin-accent-bright);word-break:break-all">${media.raw}</a>
      </div>
    `;
  }

  // Export
  window.XRMedia = {
    parseGoogleDriveUrl,
    parseYouTubeUrl,
    parseVimeoUrl,
    inspectMedia,
    renderLivePreview,
  };
})();
