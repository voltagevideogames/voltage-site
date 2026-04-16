const { createClient } = require('@supabase/supabase-js');

const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET_NAME = 'submission-photos';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Only POST method allowed' });
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { success: false, message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(500, { success: false, message: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user?.email) {
      return jsonResponse(401, { success: false, message: 'Invalid or expired token' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { success: false, message: 'Invalid JSON body' });
    }

    const submissionId = body.submissionId;
    const files = Array.isArray(body.files) ? body.files : [];

    if (!submissionId) {
      return jsonResponse(400, { success: false, message: 'submissionId is required' });
    }

    if (!files.length) {
      return jsonResponse(400, { success: false, message: 'No photo files provided' });
    }

    if (files.length > MAX_FILES) {
      return jsonResponse(400, { success: false, message: `Maximum ${MAX_FILES} photos per upload` });
    }

    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('id, customer_email, photo_urls')
      .eq('id', submissionId)
      .single();

    if (fetchError || !submission) {
      return jsonResponse(404, { success: false, message: 'Submission not found' });
    }

    if (String(submission.customer_email || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
      return jsonResponse(403, { success: false, message: 'You do not have permission to upload photos for this submission' });
    }

    const newPhotoUrls = [];

    for (const file of files) {
      const name = String(file.name || 'photo').trim();
      const type = String(file.type || '').trim();
      const size = Number(file.size || 0);
      const dataUrl = String(file.dataUrl || '');

      if (!ALLOWED_TYPES.includes(type)) {
        return jsonResponse(400, {
          success: false,
          message: `Invalid file type: ${type || 'unknown'}. Only JPEG, PNG, and WebP allowed.`,
        });
      }

      if (!size || size > MAX_FILE_SIZE) {
        return jsonResponse(400, {
          success: false,
          message: `${name} is too large. Max size is 5MB.`,
        });
      }

      if (!dataUrl.startsWith('data:')) {
        return jsonResponse(400, {
          success: false,
          message: `Invalid image payload for ${name}`,
        });
      }

      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        return jsonResponse(400, {
          success: false,
          message: `Could not read image data for ${name}`,
        });
      }

      const buffer = Buffer.from(base64, 'base64');
      const ext = getExtension(type);
      const safeBaseName = slugify(name.replace(/\.[^/.]+$/, '')) || 'photo';
      const filePath = `${submissionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBaseName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType: type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        return jsonResponse(500, { success: false, message: `Failed to upload ${name}` });
      }

      const { data: publicData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      newPhotoUrls.push(publicData.publicUrl);
    }

    let currentPhotoUrls = [];

    if (submission.photo_urls) {
      if (Array.isArray(submission.photo_urls)) {
        currentPhotoUrls = [...submission.photo_urls];
      } else if (typeof submission.photo_urls === 'string') {
        const raw = submission.photo_urls.trim();

        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            currentPhotoUrls = parsed
              .map((url) => String(url).trim())
              .filter((url) => url.length > 0);
          } else {
            throw new Error('Not an array');
          }
        } catch {
          currentPhotoUrls = raw
            .split(',')
            .map((url) => url.trim())
            .filter((url) => url.length > 0);
        }
      }
    }

    const updatedPhotoUrls = [...currentPhotoUrls];
    for (const url of newPhotoUrls) {
      if (!updatedPhotoUrls.includes(url)) {
        updatedPhotoUrls.push(url);
      }
    }

    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        photo_urls: updatedPhotoUrls,
        photos_requested: false,
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return jsonResponse(500, { success: false, message: 'Failed to update submission record' });
    }

    return jsonResponse(200, {
      success: true,
      message: 'Photos uploaded successfully',
      photo_urls: updatedPhotoUrls,
    });
  } catch (error) {
    console.error('upload-customer-submission-photos unexpected error:', error);
    return jsonResponse(500, { success: false, message: 'Server error' });
  }
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(payload),
  };
}

function getExtension(type) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}