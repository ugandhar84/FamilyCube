import { supabase } from '@/lib/supabase';

export interface PetInsurance {
  id: string;
  pet_id: string;
  provider: string;
  policy_number: string | null;
  coverage_type: string | null;
  start_date: string | null;
  end_date: string | null;
  premium_amount: number | null;
  deductible: number | null;
  reimbursement_percent: number | null;
  annual_limit: number | null;
  claims_phone: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
}

const COLS = 'id,pet_id,provider,policy_number,coverage_type,start_date,end_date,premium_amount,deductible,reimbursement_percent,annual_limit,claims_phone,file_url,notes,created_at';

export async function getInsurance(petId: string): Promise<PetInsurance[]> {
  const { data, error } = await supabase
    .from('pet_insurance')
    .select(COLS)
    .eq('pet_id', petId)
    .order('end_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as PetInsurance[];
}

export async function saveInsurance(
  petId: string,
  payload: Omit<PetInsurance, 'id' | 'pet_id' | 'created_at'>,
  id?: string,
): Promise<void> {
  const row = { pet_id: petId, ...payload, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from('pet_insurance').update(row).eq('id', id)
    : await supabase.from('pet_insurance').insert(row);
  if (error) throw error;
}

export async function deleteInsurance(id: string): Promise<void> {
  const { error } = await supabase.from('pet_insurance').delete().eq('id', id);
  if (error) throw error;
}

export interface ParsedInsuranceDoc {
  provider?: string;
  policy_number?: string;
  coverage_type?: string;
  pet_name?: string;
  start_date?: string;
  end_date?: string;
  premium_amount?: number;
  deductible?: number;
  reimbursement_percent?: number;
  annual_limit?: number;
  claims_phone?: string;
  summary?: string;
}

/** Sends a photo/scan of an insurance card to Gemini and returns extracted fields. */
export async function parseInsuranceDocument(imageBase64: string, mime: string): Promise<ParsedInsuranceDoc> {
  const { data, error } = await supabase.functions.invoke('parse-insurance-doc', {
    body: { image_base64: imageBase64, mime },
  });
  if (error) throw new Error(error.message ?? 'Could not read the document.');
  if (data?.error) throw new Error(data.error);
  return data?.data ?? {};
}
