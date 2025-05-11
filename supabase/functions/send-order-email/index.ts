import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const IS_PRODUCTION = Deno.env.get("ENVIRONMENT") === "production";
    
    // If no API key is set, send a mock success response in development
    if (!RESEND_API_KEY && !IS_PRODUCTION) {
      console.log("Development mode: Simulating email send success");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Development mode: Email simulation successful",
          emailId: `dev-${Date.now()}`
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
    
    if (!RESEND_API_KEY && IS_PRODUCTION) {
      console.error("Resend API key not configured in production environment");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service configuration error",
          details: "Please contact support for assistance"
        }),
        { 
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { orderId, fanEmail, fanName, creatorName, orderType, estimatedDelivery, siteUrl = "https://mystar.co.il" } = await req.json();
    
    if (!orderId || !fanEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // In development, use a test email address
    const toEmail = IS_PRODUCTION ? fanEmail : "delivered@resend.dev";
    const fromEmail = IS_PRODUCTION ? "orders@mystar.co.il" : "onboarding@resend.dev";
    
    const htmlContent = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h1 style="color: #0284c7; text-align: center;">תודה על ההזמנה שלך!</h1>
        
        <div style="text-align: center; margin: 20px 0;">
          <img src="https://answerme.co.il/mystar/logo.png" alt="MyStar" style="width: 120px; height: auto;" />
        </div>
        
        <p style="margin-top: 20px;">שלום ${fanName || 'מעריץ יקר'},</p>
        
        <p>תודה שהזמנת סרטון ברכה מ${creatorName}!</p>
        
        <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #0284c7; margin-top: 0;">פרטי ההזמנה שלך:</h3>
          <p><strong>מספר הזמנה:</strong> #${orderId.substring(0, 8)}</p>
          <p><strong>סוג בקשה:</strong> ${orderType}</p>
          <p><strong>יוצר:</strong> ${creatorName}</p>
          <p><strong>זמן אספקה משוער:</strong> ${estimatedDelivery || '24-48 שעות'}</p>
        </div>
        
        <p>הבקשה שלך התקבלה והועברה ליוצר. היוצר יעבוד על הסרטון בהקדם האפשרי.</p>
        
        <p>כאשר הסרטון יהיה מוכן, נשלח לך הודעה ותוכל לצפות בו בלוח הבקרה שלך.</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${siteUrl}/dashboard/fan" style="background-color: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">צפה בדף ההזמנה</a>
        </div>
        
        <p>אם יש לך שאלות כלשהן לגבי ההזמנה שלך, אל תהסס לפנות אלינו בכתובת <a href="mailto:support@mystar.co.il">support@mystar.co.il</a>.</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
          <p>&copy; ${new Date().getFullYear()} MyStar - מיי סטאר. כל הזכויות שמורות.</p>
        </div>
      </div>
    `;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmail,
          subject: `הבקשה שלך התקבלה! - סרטון ברכה מ${creatorName}`,
          html: htmlContent,
          reply_to: "support@mystar.co.il"
        })
      });

      const resendData = await response.json();
      
      if (!response.ok) {
        console.error('Resend API error:', {
          status: response.status,
          statusText: response.statusText,
          error: resendData
        });
        
        await supabaseClient.from('audit_logs').insert({
          action: 'send_order_email_failed',
          entity: 'requests',
          entity_id: orderId,
          user_id: user.id,
          details: {
            fanEmail: toEmail,
            creatorName,
            error: resendData.message || 'Failed to send email',
            timestamp: new Date().toISOString()
          }
        });
        
        // In development, still return success to allow testing
        if (!IS_PRODUCTION) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Development mode: Email simulation successful (API error ignored)",
              emailId: `dev-${Date.now()}`
            }),
            { 
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }
        
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

      await supabaseClient.from('audit_logs').insert({
        action: 'send_order_email_success',
        entity: 'requests',
        entity_id: orderId,
        user_id: user.id,
        details: {
          fanEmail: toEmail,
          creatorName,
          emailId: resendData.id,
          timestamp: new Date().toISOString()
        }
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "Order confirmation email sent successfully",
          emailId: resendData.id
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    } catch (err) {
      console.error('Error sending email:', err);
      
      await supabaseClient.from('audit_logs').insert({
        action: 'send_order_email_exception',
        entity: 'requests',
        entity_id: orderId,
        user_id: user.id,
        details: {
          error: err.message || 'Unknown error',
          fanEmail: toEmail,
          creatorName,
          timestamp: new Date().toISOString()
        }
      });
      
      // In development, still return success to allow testing
      if (!IS_PRODUCTION) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Development mode: Email simulation successful (error ignored)",
            emailId: `dev-${Date.now()}`
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }
      
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
    console.error('Error in send-order-email function:', error);
    
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
