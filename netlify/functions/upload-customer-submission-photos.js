const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs');

exports.handler = async (event, context) => {
  // CORS preflight
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
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: 'Only POST method allowed' }),
    };
  }

  let token;
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing bearer token');
    }
    token = authHeader.split(' ')[1];
  } catch (e) {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Missing or invalid authorization header' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Server configuration error' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  let user;
  try {
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      throw new Error('Invalid token');
    }
    user = userData.user;
  } catch (err) {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Invalid or expired token' }),
    };
  }

  const userEmail = user.email;

  // Parse multipart/form-data
  let fields, filesObj;
  try {
    const form = formidable({
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB per file
    });

    const parseResult = await new Promise((resolve, reject) => {
      form.parse(event, (err, flds, fls) => {
        if (err) reject(err);
        else resolve({ fields: flds, files: fls });
      });
    });

    fields = parseResult.fields;
    filesObj = parseResult.files;
  } catch (parseErr) {
    console.error('Form parse error:', parseErr);
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Failed to parse upload data' }),
    };
  }

  const submissionId = Array.isArray(fields.submissionId)
    ? fields.submissionId[0]
    : fields.submissionId;

  if (!submissionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'submissionId is required' }),
    };
  }

  // Collect all uploaded files (handles any field name used by frontend)
  let uploadedFiles = [];
  if (filesObj) {
    Object.keys(filesObj).forEach((key) => {
      const fileList = filesObj[key];
      if (Array.isArray(fileList)) {
        uploadedFiles = uploadedFiles.concat(fileList);
      } else if (fileList) {
        uploadedFiles.push(fileList);
      }
    });
  }

  if (uploadedFiles.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'No photo files provided' }),
    };
  }

  if (uploadedFiles.length > 10) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Maximum 10 photos per upload' }),
    };
  }

  // Validate file types
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  for (const file of uploadedFiles) {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: `Invalid file type: ${file.mimetype || 'unknown'}. Only JPEG, PNG, and WebP allowed.`,
        }),
      };
    }
  }

  // Verify submission exists and belongs to this user
  let submission;
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('id, customer_email, photo_urls')
      .eq('id', submissionId)
      .single();

    if (error || !data) {
      throw new Error('Submission not found');
    }
    submission = data;
  } catch (err) {
    return {
      statusCode: 404,
      body: JSON.stringify({ success: false, message: 'Submission not found' }),
    };
  }

  if (submission.customer_email !== userEmail) {
    return {
      statusCode: 403,
      body: JSON.stringify({ success: false, message: 'You do not have permission to upload photos for this submission' }),
    };
  }

  // Upload files to Supabase Storage (same pattern used elsewhere in the project)
  const BUCKET_NAME = 'submission-photos';
  const newPhotoUrls = [];

  for (const file of uploadedFiles) {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const ext = file.originalFilename
      ? file.originalFilename.split('.').pop().toLowerCase()
      : 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
    const filePath = `${submissionId}/${timestamp}-${randomSuffix}.${safeExt}`;

    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(file.filepath);
    } catch (readErr) {
      console.error('Failed to read uploaded file:', readErr);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: 'Failed to process uploaded file' }),
      };
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: 'Failed to upload photo to storage' }),
      };
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    newPhotoUrls.push(urlData.publicUrl);
  }
// Build updated photo_urls (preserve existing, append new, handle string vs array safely)
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
          .map(url => String(url).trim())
          .filter(url => url.length > 0);
      } else {
        throw new Error('Not an array');
      }

    } catch {
      // fallback: comma-separated string
      currentPhotoUrls = raw
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0);
    }
  }
}

// Deduplicate + append new
const updatedPhotoUrls = [...currentPhotoUrls];

for (const url of newPhotoUrls) {
  if (!updatedPhotoUrls.includes(url)) {
    updatedPhotoUrls.push(url);
  }
}

  // Update submission record
  try {
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        photo_urls: updatedPhotoUrls,
        photos_requested: false,
      })
      .eq('id', submissionId);

    if (updateError) {
      throw updateError;
    }
  } catch (updateErr) {
    console.error('Database update error:', updateErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to update submission record' }),
    };
  }

  // Success response
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      success: true,
      message: 'Photos uploaded successfully',
      photo_urls: updatedPhotoUrls,
    }),
  };
};