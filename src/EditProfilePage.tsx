import { useState, useRef, useEffect } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { Upload } from 'lucide-react';
import { useAuth } from './utils/authContext';
import { supabase } from './utils/supabaseClient';
import { compressImage } from './utils/imageCompression';
import { validateImageFile, ImageUploadError, IMAGE_UPLOAD_CONFIGS } from './utils/imageUpload';
import { toast } from 'sonner@2.0.3';

const BIO_MAX_LENGTH = 240;

// Graduation year options span from 6 years back (alumni still updating
// their profile) to 6 years ahead (incoming students), recomputed against
// the current year instead of a hardcoded range that goes stale.
const currentYear = new Date().getFullYear();
const graduationYearOptions = Array.from({ length: 13 }, (_, i) => currentYear + 6 - i);

export default function EditProfilePage() {
  const { user, updateUser } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
    major: user?.department || '',
    graduationYear: user?.graduationYear || '',
  });

  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [pendingAvatarMimeType, setPendingAvatarMimeType] = useState<string>('image/jpeg');
  const [saving, setSaving] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The preview can be a local blob: URL while a new photo is pending;
  // release it on unmount / replacement so it doesn't leak memory.
  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validateImageFile(file, 'avatar');
    } catch (err) {
      toast.error(err instanceof ImageUploadError ? err.message : 'Could not use that image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setProcessingPhoto(true);
    try {
      const config = IMAGE_UPLOAD_CONFIGS.avatar;
      const { blob, mimeType } = await compressImage(file, {
        maxDimension: config.maxDimension,
        targetBytes: config.targetBytes,
      });
      if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
      setPendingAvatarBlob(blob);
      setPendingAvatarMimeType(mimeType);
      setAvatarPreview(URL.createObjectURL(blob));
    } catch (err: any) {
      toast.error(err?.message || 'Could not process that image.');
    } finally {
      setProcessingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // Only touch Storage if the user actually picked a new photo — the old
    // upload-on-select flow overwrote the stored avatar immediately, so
    // clicking Cancel afterward couldn't undo it. Uploading here means
    // nothing is written until Save succeeds.
    let avatarUrl = user.avatar || '';
    if (pendingAvatarBlob) {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(user.id, pendingAvatarBlob, { upsert: true, contentType: pendingAvatarMimeType });

      if (uploadError) {
        toast.error(uploadError.message || 'Photo upload failed.');
        setSaving(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(user.id);
      avatarUrl = `${publicUrl}?t=${Date.now()}`;
    }

    const { error } = await updateUser({
      name: formData.name,
      bio: formData.bio,
      department: formData.major,
      graduationYear: formData.graduationYear || undefined,
      avatar: avatarUrl || undefined,
    });

    setSaving(false);

    if (error) {
      toast.error(error.message || 'Failed to save changes. Please try again.');
      return;
    }

    toast.success('Profile updated.');
    window.location.hash = 'profile';
  };

  const handleCancel = () => {
    window.location.hash = 'profile';
  };

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="profile" />

      {/* Main Content */}
      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-[#111] mb-1 font-[Bayon]">EDIT PROFILE</h1>
          <p className="text-[#666] font-[Roboto]">Update your personal information</p>
        </div>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card className="p-6 border-t border-b border-l-0 border-r-0 border-[#f0f0f0] rounded-[0px]">
            <h2 className="text-[#111] mb-4 font-[Roboto] font-bold">Basic Information</h2>

            {/* Profile Photo and Name/Email Combined */}
            <div className="flex flex-col sm:flex-row gap-6 mb-6">
              {/* Left: Avatar Upload */}
              <div className="flex flex-col items-center gap-3">
                <Avatar className="w-20 h-20 border-2 border-[#f0f0f0] shadow-sm">
                  <AvatarImage src={avatarPreview} alt={formData.name} />
                  <AvatarFallback className="text-xl bg-[#6366f1] text-white font-[Roboto]">
                    {formData.name.split(' ').map(n => n[0]).join('') || '?'}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={processingPhoto || saving}
                  className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-4 py-2 rounded-lg gap-2 font-[Roboto] text-sm"
                >
                  <Upload className="w-4 h-4" />
                  {processingPhoto ? 'Processing…' : 'Upload Photo'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Right: Full Name and Email */}
              <div className="flex-1 space-y-4">
                <div>
                  <Label htmlFor="name" className="text-[#666] mb-2 block font-[Roboto]">Full Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="border-[#f0f0f0] rounded-lg font-[Roboto]"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-[#666] mb-2 block font-[Roboto]">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    disabled
                    className="border-[#f0f0f0] rounded-lg bg-[#fafafa] text-[#666] font-[Roboto]"
                  />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="bio" className="text-[#666] font-[Roboto]">Bio</Label>
                <span className="text-xs text-[#999] font-[Roboto]">
                  {formData.bio.length}/{BIO_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value.slice(0, BIO_MAX_LENGTH))}
                maxLength={BIO_MAX_LENGTH}
                className="border-[#f0f0f0] rounded-lg min-h-[100px] font-[Roboto]"
                placeholder="Tell us about yourself..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="major" className="text-[#666] mb-2 block font-[Roboto]">Major</Label>
                <Input
                  id="major"
                  value={formData.major}
                  onChange={(e) => handleInputChange('major', e.target.value)}
                  className="border-[#f0f0f0] rounded-lg font-[Roboto]"
                  placeholder="e.g. Computer Science"
                />
              </div>

              <div>
                <Label htmlFor="graduationYear" className="text-[#666] mb-2 block font-[Roboto]">Graduation Year</Label>
                <Select value={formData.graduationYear} onValueChange={(value) => handleInputChange('graduationYear', value)}>
                  <SelectTrigger className="border-[#f0f0f0] rounded-lg font-[Roboto]">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {graduationYearOptions.map(year => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button
              onClick={handleCancel}
              disabled={saving}
              className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-6 py-2 rounded-lg font-[Roboto]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || processingPhoto}
              className="bg-[rgb(0,0,0)] hover:bg-[#4f46e5] text-white px-6 py-2 rounded-lg shadow-sm font-[Roboto]"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
