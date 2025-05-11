import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Validate Resend API key
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "re_Rd7RQJcH_NAcieG7itN95tK4Cv2zUR314";
    
    if (!RESEND_API_KEY) {
      console.error("Resend API key not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not properly configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get user session
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Parse request body
    const { to, subject, template, data } = await req.json();

    if (!to || !subject || !template) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Add site URL if not present
    const siteUrl = "https://mystar.co.il";
    const emailData = { ...data, siteUrl };

    // Get email template from database
    const { data: templateData, error: templateError } = await supabaseClient
      .from('email_templates')
      .select('*')
      .eq('name', template)
      .single();

    if (templateError) {
      console.error('Error fetching email template:', templateError);
      return new Response(
        JSON.stringify({ success: false, error: "Template not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Replace variables in template
    let content = templateData.content;
    if (emailData) {
      Object.entries(emailData).forEach(([key, value]) => {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value as string);
      });
    }

    // Replace any remaining Supabase URLs with the actual domain
    content = content.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, siteUrl);

    // Send email using Resend API
    // For demonstration purposes, we'll just log the email details
    console.log('Email details:', {
      to,
      subject,
      content
    });

    try {
      // Use domain email with the domain you've verified with Resend
      const fromEmail = "noreply@mystar.co.il";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: to,
          subject: subject,
          html: content
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Resend API error:', responseData);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to send email",
            details: responseData.message || "Unknown error"
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }

      // Log the email sending attempt
      await supabaseClient.from('audit_logs').insert({
        action: 'send_email',
        entity: 'email',
        user_id: user.id,
        details: {
          to,
          subject,
          template,
          timestamp: new Date().toISOString()
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Email sent successfully",
          id: responseData.id
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      console.error("Error sending email:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to send email",
          details: error.message || "Unknown error"
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
  } catch (error) {
    console.error('Error in send-email function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected error occurred",
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
