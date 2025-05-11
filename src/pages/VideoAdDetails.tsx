import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import toast from 'react-hot-toast';
import { BookingForm, BookingFormData } from '../components/BookingForm';
import { sendOrderConfirmationEmail, sendCreatorOrderNotificationEmail } from '../utils/emailService';
import { supabase } from '../lib/supabase';

interface VideoAd {
  id: string;
  creator: {
    id: string;
    name: string;
  };
  price: number;
  duration: number;
}

export function VideoAdDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ad, setAd] = React.useState<VideoAd | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchVideoAd() {
      try {
        const { data, error } = await supabase
          .from('video_ads')
          .select(`
            id,
            price,
            duration,
            creator:creator_id (
              id,
              name
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        setAd(data);
      } catch (error) {
        toast.error('Failed to load video ad details');
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchVideoAd();
  }, [id]);

  const handleBooking = async (formData: BookingFormData) => {
    try {
      if (!ad) throw new Error('Video ad not found');

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        toast.error('Please sign in to book a video ad');
        navigate('/login', { state: { returnTo: `/video-ad/${id}` } });
        return;
      }

      // Parse the deadline date string to ensure it's in the correct format
      const deadlineDate = new Date(formData.deadline);
      
      // Create request with video_ad_id and properly formatted deadline
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .insert({
          creator_id: ad.creator.id,
          fan_id: user.id,
          video_ad_id: ad.id,
          message: formData.message,
          request_type: formData.request_type,
          status: 'pending',
          price: ad.price,
          deadline: deadlineDate.toISOString(), // Format deadline as ISO string
          recipient: formData.recipient
        })
        .select()
        .single();

      if (requestError || !request) {
        throw new Error(requestError?.message || 'Failed to create request');
      }

      // Process payment
      const { data: payment, error: paymentError } = await supabase.rpc('process_request_payment', {
        p_request_id: request.id,
        p_fan_id: user.id,
        p_creator_id: ad.creator.id,
        p_amount: ad.price
      });

      if (paymentError || !payment?.success) {
        throw new Error(paymentError?.message || payment?.error || 'Failed to process payment');
      }

      // Send order confirmation email to fan
      const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'משתמש יקר';
      const userEmail = user.email;

      const requestTypeMap: Record<string, string> = {
        'birthday': 'יום הולדת',
        'anniversary': 'יום נישואין',
        'congratulations': 'ברכות',
        'motivation': 'מוטיבציה',
        'other': 'אחר'
      };

      const translatedRequestType = requestTypeMap[formData.request_type] || formData.request_type;

      if (userEmail) {
        await sendOrderConfirmationEmail(
          request.id,
          userEmail,
          userName,
          ad.creator.name,
          translatedRequestType,
          formData.message,
          ad.price
        );
      }

      // Get creator email and send notification
      const { data: creatorData, error: creatorError } = await supabase
        .from('users')
        .select('email')
        .eq('id', ad.creator.id)
        .single();

      if (!creatorError && creatorData?.email) {
        try {
          await sendCreatorOrderNotificationEmail(
            request.id,
            creatorData.email,
            ad.creator.name,
            user.user_metadata?.name || user.email?.split('@')[0] || 'מעריץ',
            formData.request_type,
            formData.message,
            ad.price
          );
          console.log('Creator notification email sent successfully');
        } catch (emailError) {
          console.error('Error sending creator notification email:', emailError);
          // Don't throw here, we still want to show success even if email failed
        }
      }

      toast.success('ההזמנה בוצעה בהצלחה!');
      navigate('/thank-you');
    } catch (error) {
      toast.error('Failed to process booking');
      console.error('Error:', error);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>;
  }

  if (!ad) {
    return <div className="text-center py-12">
      <h2 className="text-2xl font-semibold text-gray-900">Video ad not found</h2>
    </div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Book a Video from {ad.creator.name}
        </h1>
        
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg text-gray-600">Price:</span>
            <span className="text-2xl font-semibold text-primary">{formatCurrency(ad.price)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-lg text-gray-600">Delivery Time:</span>
            <span className="text-lg text-gray-900">Within {ad.duration} days</span>
          </div>
        </div>

        <BookingForm 
          creatorId={ad.creator.id}
          creatorName={ad.creator.name}
          price={ad.price}
          onSubmit={handleBooking}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  );
}
