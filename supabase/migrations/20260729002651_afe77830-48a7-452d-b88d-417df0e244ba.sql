-- Remove OneSignal / push notification layer
DROP TRIGGER IF EXISTS trg_notify_drivers_on_new_request ON public.delivery_requests;
DROP TRIGGER IF EXISTS trg_notify_onesignal_on_new_request ON public.delivery_requests;
DROP TRIGGER IF EXISTS trg_cancel_push_on_accept ON public.delivery_requests;
DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON public.push_subscriptions;
DROP TRIGGER IF EXISTS update_onesignal_devices_updated_at ON public.onesignal_devices;

DROP FUNCTION IF EXISTS public.notify_drivers_on_new_request();
DROP FUNCTION IF EXISTS public.notify_onesignal_on_new_request();
DROP FUNCTION IF EXISTS public.cancel_push_on_accept();

ALTER TABLE public.delivery_requests DROP COLUMN IF EXISTS onesignal_notification_id;

DROP TABLE IF EXISTS public.push_delivery_events;
DROP TABLE IF EXISTS public.push_notification_logs;
DROP TABLE IF EXISTS public.push_subscriptions;
DROP TABLE IF EXISTS public.onesignal_devices;