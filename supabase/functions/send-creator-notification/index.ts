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

    // Get user session for authentication
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
    const { 
      orderId, 
      creatorEmail,
      creatorName, 
      fanName,
      orderType, 
      orderMessage,
      orderPrice,
      siteUrl = "https://mystar.co.il" // Default to the production domain
    } = await req.json();
    
    // Validate required fields
    if (!orderId || !creatorEmail || !creatorName) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields for creator notification" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Use domain email with the domain you've verified with Resend
    const fromEmail = "orders@mystar.co.il";
    
    // Format the price with 2 decimal places
    const formattedPrice = typeof orderPrice === 'number' ? orderPrice.toFixed(2) : orderPrice;
    
    // Translate request type to Hebrew
    const requestTypeMap: Record<string, string> = {
      'birthday': 'יום הולדת',
      'anniversary': 'יום נישואין',
      'congratulations': 'ברכות',
      'motivation': 'מוטיבציה',
      'other': 'אחר'
    };
    
    const translatedRequestType = requestTypeMap[orderType] || orderType || 'לא צוין';
    
    // Create HTML email content for creator notification
    const htmlContent = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h1 style="color: #0284c7; text-align: center;">הזמנה חדשה!</h1>
        
        <p style="margin-top: 20px;">שלום ${creatorName},</p>
        
        <p>התקבלה הזמנה חדשה מ${fanName || 'מעריץ'}!</p>
        
        <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #0284c7; margin-top: 0;">פרטי ההזמנה:</h3>
          <p><strong>מספר הזמנה:</strong> #${orderId.substring(0, 8)}</p>
          <p><strong>סוג בקשה:</strong> ${translatedRequestType}</p>
          <p><strong>מחיר:</strong> ₪${formattedPrice}</p>
          <p><strong>הודעה מהמעריץ:</strong></p>
          <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin-top: 10px;">
            ${orderMessage.replace(/\n/g, '<br>')}
          </div>
        </div>
        
        <p>אנא היכנס ללוח הבקרה שלך כדי לאשר או לדחות את ההזמנה. זכור שיש לך 48 שעות לאשר או לדחות את ההזמנה.</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${siteUrl}/dashboard/creator/requests" style="background-color: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">צפה בהזמנה</a>
        </div>
        
        <p>אם יש לך שאלות כלשהן, אל תהסס לפנות אלינו בכתובת <a href="mailto:support@mystar.co.il">support@mystar.co.il</a>.</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
          <p>&copy; ${new Date().getFullYear()} MyStar - מיי סטאר. כל הזכויות שמורות.</p>
        </div>
      </div>
    `;

    // Send email via Resend API
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: creatorEmail,
          subject: `הזמנה חדשה מ${fanName || 'מעריץ'} - MyStar`,
          html: htmlContent
        })
      });

      const resendData = await response.json();
      
      if (!response.ok) {
        console.error('Resend API error:', {
          status: response.status,
          statusText: response.statusText,
          error: resendData
        });
        
        // Log the email attempt even if it fails
        await supabaseClient.from('audit_logs').insert({
          action: 'send_creator_notification_failed',
          entity: 'requests',
          entity_id: orderId,
          user_id: user.id,
          details: {
            creatorEmail,
            creatorName,
            error: resendData.message || 'Failed to send email',
            timestamp: new Date().toISOString()
          }
        });
        
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to send email",
            details: resendData.message || 'Unknown error'
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }

      // Log the successful email
      await supabaseClient.from('audit_logs').insert({
        action: 'send_creator_notification_success',
        entity: 'requests',
        entity_id: orderId,
        user_id: user.id,
        details: {
          creatorEmail,
          creatorName,
          emailId: resendData.id,
          timestamp: new Date().toISOString()
        }
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "Creator notification email sent successfully",
          emailId: resendData.id
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    } catch (err) {
      console.error('Error sending email:', err);
      
      // Log the error
      await supabaseClient.from('audit_logs').insert({
        action: 'send_creator_notification_exception',
        entity: 'requests',
        entity_id: orderId,
        user_id: user.id,
        details: {
          error: err.message || 'Unknown error',
          creatorEmail,
          creatorName,
          timestamp: new Date().toISOString()
        }
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          error: "An error occurred while sending the email",
          details: err.message || 'Unknown error'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
  } catch (error) {
    console.error('Error in send-creator-notification function:', error);
    
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
