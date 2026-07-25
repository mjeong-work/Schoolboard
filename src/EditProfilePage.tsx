import { useState, useRef } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Separator } from './components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { ArrowLeft, Upload } from 'lucide-react';
import { useAuth } from './utils/authContext';
import { supabase } from './utils/supabaseClient';
import { toast } from 'sonner@2.0.3';

export default function EditProfilePage() {
  const { user, updateUser } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
    major: user?.department || '',
    graduationYear: user?.graduationYear || '',
    location: '',
    townCommunity: '',
    avatar: user?.avatar || ''
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [interests, setInterests] = useState({
    school: true,
    academics: false,
    sports: false,
    arts: false,
    technology: false,
    music: false,
    volunteering: false,
    career: false,
    socialEvents: false,
    foodDining: false,
    fitness: false,
    gaming: false
  });

  const [communities, setCommunities] = useState({
    currentStudents: false,
    alumni: false,
    gradStudents: false,
    international: false,
    localResidents: false,
    campusOrganizations: false
  });

  const handleInterestToggle = (key: string) => {
    setInterests(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCommunityToggle = (key: string) => {
    setCommunities(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5 MB.');
      return;
    }

    setUploading(true);
    try {
      // Store as {userId} — fixed path so upsert always replaces the same object
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(user.id, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(user.id);

      // Append a timestamp to bust the CDN cache for the same path
      const freshUrl = `${publicUrl}?t=${Date.now()}`;
      setFormData(prev => ({ ...prev, avatar: freshUrl }));
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await updateUser({
      name: formData.name,
      bio: formData.bio,
      department: formData.major,
      graduationYear: formData.graduationYear || undefined,
      avatar: formData.avatar || undefined,
    });
    setSaving(false);
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
          <p className="text-[#666] font-[Roboto]">Update your personal information and preferences</p>
        </div>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card className="p-6 border-t border-b border-l-0 border-r-0 border-[#f0f0f0] rounded-[0px]">
            <h2 className="text-[#111] mb-4 font-[Roboto] font-bold">Basic Information</h2>

            {/* Profile Photo and Name/Email Combined */}
            <div className="flex flex-col sm:flex-row gap-6 mb-6">
              {/* Left: Avatar Upload */}
              <div className="flex flex-col items-center gap-3">
                <Avatar className="w-20 h-20 border-2 border-white shadow-sm">
                  <AvatarImage src={formData.avatar} alt={formData.name} />
                  <AvatarFallback className="text-xl bg-[#6366f1] text-white font-[Roboto]">
                    {formData.name.split(' ').map(n => n[0]).join('') || '?'}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={uploading || saving}
                  className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-4 py-2 rounded-lg gap-2 font-[Roboto] text-sm"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading…' : 'Upload Photo'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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
              <Label htmlFor="bio" className="text-[#666] mb-2 block font-[Roboto]">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
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
                    {Array.from({ length: 2029 - 1990 + 1 }, (_, i) => 2029 - i).map(year => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Location Settings */}
          <Card className="p-6 border-t border-b border-l-0 border-r-0 border-[#f0f0f0] rounded-[0px]">
            <h2 className="text-[#111] mb-4 font-[Roboto] font-bold">Location Settings</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="location" className="text-[#666] mb-2 block font-[Roboto]">Campus Location</Label>
                <Select value={formData.location} onValueChange={(value) => handleInputChange('location', value)}>
                  <SelectTrigger className="border-[#f0f0f0] rounded-lg font-[Roboto]">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="North Campus">North Campus</SelectItem>
                    <SelectItem value="South Campus">South Campus</SelectItem>
                    <SelectItem value="East Campus">East Campus</SelectItem>
                    <SelectItem value="West Campus">West Campus</SelectItem>
                    <SelectItem value="Off Campus">Off Campus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="townCommunity" className="text-[#666] mb-2 block font-[Roboto]">Town / Community</Label>
                <Select value={formData.townCommunity} onValueChange={(value) => handleInputChange('townCommunity', value)}>
                  <SelectTrigger className="border-[#f0f0f0] rounded-lg font-[Roboto]">
                    <SelectValue placeholder="Select community" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Downtown Area">Downtown Area</SelectItem>
                    <SelectItem value="University District">University District</SelectItem>
                    <SelectItem value="Suburban Area">Suburban Area</SelectItem>
                    <SelectItem value="City Center">City Center</SelectItem>
                    <SelectItem value="Historic District">Historic District</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Community Preferences */}
          <Card className="p-6 border-t border-b border-l-0 border-r-0 border-[#f0f0f0] rounded-[0px]">
            <h2 className="text-[#111] mb-2 font-[Roboto] font-bold">Community Preferences</h2>
            <p className="text-sm text-[#666] mb-4 font-[Roboto]">Select the communities you want to engage with</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Checkbox id="currentStudents" checked={communities.currentStudents} onCheckedChange={() => handleCommunityToggle('currentStudents')} className="mt-1" />
                <div>
                  <Label htmlFor="currentStudents" className="text-[#111] cursor-pointer font-[Roboto]">Current Students</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Connect with fellow students</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="alumni" checked={communities.alumni} onCheckedChange={() => handleCommunityToggle('alumni')} className="mt-1" />
                <div>
                  <Label htmlFor="alumni" className="text-[#111] cursor-pointer font-[Roboto]">Alumni Network</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Stay connected with graduates</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="gradStudents" checked={communities.gradStudents} onCheckedChange={() => handleCommunityToggle('gradStudents')} className="mt-1" />
                <div>
                  <Label htmlFor="gradStudents" className="text-[#111] cursor-pointer font-[Roboto]">Graduate Students</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Graduate-level connections</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="international" checked={communities.international} onCheckedChange={() => handleCommunityToggle('international')} className="mt-1" />
                <div>
                  <Label htmlFor="international" className="text-[#111] cursor-pointer font-[Roboto]">International Students</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Global campus community</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="localResidents" checked={communities.localResidents} onCheckedChange={() => handleCommunityToggle('localResidents')} className="mt-1" />
                <div>
                  <Label htmlFor="localResidents" className="text-[#111] cursor-pointer font-[Roboto]">Local Residents</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Engage with local community</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="campusOrganizations" checked={communities.campusOrganizations} onCheckedChange={() => handleCommunityToggle('campusOrganizations')} className="mt-1" />
                <div>
                  <Label htmlFor="campusOrganizations" className="text-[#111] cursor-pointer font-[Roboto]">Campus Organizations</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Join student groups and clubs</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Interest Preferences */}
          <Card className="p-6 border-t border-b border-l-0 border-r-0 border-[#f0f0f0] rounded-[0px]">
            <h2 className="text-[#111] mb-2 font-[Roboto] font-bold">Interest Preferences</h2>
            <p className="text-sm text-[#666] mb-4 font-[Roboto]">Customize your feed by selecting topics you're interested in</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <Checkbox id="school" checked={interests.school} onCheckedChange={() => handleInterestToggle('school')} className="mt-1" disabled />
                <div>
                  <Label htmlFor="school" className="text-[#111] cursor-pointer font-[Roboto]">School & Campus</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Required</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="academics" checked={interests.academics} onCheckedChange={() => handleInterestToggle('academics')} className="mt-1" />
                <div>
                  <Label htmlFor="academics" className="text-[#111] cursor-pointer font-[Roboto]">Academics</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Study groups, resources</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="sports" checked={interests.sports} onCheckedChange={() => handleInterestToggle('sports')} className="mt-1" />
                <div>
                  <Label htmlFor="sports" className="text-[#111] cursor-pointer font-[Roboto]">Sports & Recreation</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Campus athletics, teams</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="arts" checked={interests.arts} onCheckedChange={() => handleInterestToggle('arts')} className="mt-1" />
                <div>
                  <Label htmlFor="arts" className="text-[#111] cursor-pointer font-[Roboto]">Arts & Culture</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Theater, galleries, exhibits</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="technology" checked={interests.technology} onCheckedChange={() => handleInterestToggle('technology')} className="mt-1" />
                <div>
                  <Label htmlFor="technology" className="text-[#111] cursor-pointer font-[Roboto]">Technology</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Tech talks, hackathons</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="music" checked={interests.music} onCheckedChange={() => handleInterestToggle('music')} className="mt-1" />
                <div>
                  <Label htmlFor="music" className="text-[#111] cursor-pointer font-[Roboto]">Music</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Concerts, performances</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="volunteering" checked={interests.volunteering} onCheckedChange={() => handleInterestToggle('volunteering')} className="mt-1" />
                <div>
                  <Label htmlFor="volunteering" className="text-[#111] cursor-pointer font-[Roboto]">Volunteering</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Community service</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="career" checked={interests.career} onCheckedChange={() => handleInterestToggle('career')} className="mt-1" />
                <div>
                  <Label htmlFor="career" className="text-[#111] cursor-pointer font-[Roboto]">Career & Networking</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Job fairs, mentorship</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="socialEvents" checked={interests.socialEvents} onCheckedChange={() => handleInterestToggle('socialEvents')} className="mt-1" />
                <div>
                  <Label htmlFor="socialEvents" className="text-[#111] cursor-pointer font-[Roboto]">Social Events</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Parties, meetups</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="foodDining" checked={interests.foodDining} onCheckedChange={() => handleInterestToggle('foodDining')} className="mt-1" />
                <div>
                  <Label htmlFor="foodDining" className="text-[#111] cursor-pointer font-[Roboto]">Food & Dining</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Restaurants, food events</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="fitness" checked={interests.fitness} onCheckedChange={() => handleInterestToggle('fitness')} className="mt-1" />
                <div>
                  <Label htmlFor="fitness" className="text-[#111] cursor-pointer font-[Roboto]">Fitness & Wellness</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Gym, yoga, health</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="gaming" checked={interests.gaming} onCheckedChange={() => handleInterestToggle('gaming')} className="mt-1" />
                <div>
                  <Label htmlFor="gaming" className="text-[#111] cursor-pointer font-[Roboto]">Gaming</Label>
                  <p className="text-xs text-[#666] font-[Roboto]">Esports, game nights</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button
              onClick={handleCancel}
              className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-6 py-2 rounded-lg font-[Roboto]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
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
