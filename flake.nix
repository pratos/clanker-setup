{
  description = "Pi coding agent – skills, extensions, and settings";

  inputs = {};

  outputs = {self, ...}: {
    homeManagerModules.default = import ./nix/home-module.nix self;
    homeManagerModules.pi = self.homeManagerModules.default;
  };
}
