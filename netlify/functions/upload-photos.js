const { createClient } = require('@supabase/supabase-js');

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'submission-photos';

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(500, { error: 'Missing Supabase environment variables' });
    }

    const body = JSON.parse(event.body || '{}');
    const files = Array.isArray(body.files) ? body.files : [];

    if (!files.length) {
      return jsonResponse(400, { error: 'No files provided' });
    }

    if (files.length > MAX_FILES) {
      return jsonResponse(400, { error: `Maximum ${MAX_FILES} photos allowed` });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const uploaded = [];

    for (const file of files) {
      const name = String(file.name || 'photo').trim();
      const type = String(file.type || '').trim();
      const size = Number(file.size || 0);
      const dataUrl = String(file.dataUrl || '');

      if (!ALLOWED_TYPES.includes(type)) {
        return jsonResponse(400, { error: `Unsupported file type: ${type || 'unknown'}` });
      }

      if (!size || size > MAX_FILE_SIZE) {
        return jsonResponse(400, { error: `${name} is too large. Max size is 5MB.` });
      }

      if (!dataUrl.startsWith('data:')) {
        return jsonResponse(400, { error: `Invalid image payload for ${name}` });
      }

      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        return jsonResponse(400, { error: `Could not read image data for ${name}` });
      }

      const buffer = Buffer.from(base64, 'base64');
      const ext = getExtension(type);
      const safeBaseName = slugify(name.replace(/\.[^/.]+$/, '')) || 'photo';
      const filePath = `submissions/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBaseName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buffer, {
          contentType: type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase storage upload error:', uploadError);
        return jsonResponse(500, { error: `Failed to upload ${name}` });
      }

      const { data: publicData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      uploaded.push({
        url: publicData.publicUrl,
        path: filePath,
        name,
        type,
      });
    }

    return jsonResponse(200, {
      success: true,
      photos: uploaded,
    });
  } catch (error) {
    console.error('upload-photos failed:', error);
    return jsonResponse(500, {
      error: 'Photo upload failed',
      details: error.message,
    });
  }
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function getExtension(type) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'bin';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}